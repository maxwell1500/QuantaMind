use super::padding::{build_padding, inject_at_depth};
use super::presets::CliffSource;
use crate::errors::AppResult;
use crate::inference::eval::agentic::model_turn::ModelTurn;
use crate::inference::eval::readiness::types::CliffStatus;
use crate::inference::eval::toolcall::eval::{aggregate, TaskResult};
use crate::inference::eval::toolcall::parse::extract_calls;
use crate::inference::eval::toolcall::prompt::build_system_for;
use crate::inference::eval::toolcall::score::score;
use crate::inference::eval::toolcall::tasks::ToolTask;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use serde::{Deserialize, Serialize};

/// Byte seed per target token. The model's REAL `prompt_eval_count` is measured
/// afterward and the padding rebuilt proportionally — this 4:1 ratio is only the
/// starting estimate, never the reported depth.
const BYTES_PER_TOKEN: usize = 4;
/// Max proportional rebuilds after the first attempt (verify-and-adjust).
const MAX_ADJUST_ATTEMPTS: usize = 2;
/// Accept a rung when the measured depth is within ±5% of the requested target.
const ADJUST_TOLERANCE: f64 = 0.05;
/// Output token cap per probe turn — only a tool call is expected, never prose.
const MAX_OUTPUT: u32 = 256;
/// The baseline rung must clear this composite or the run is `Broken` (the model
/// can't even do the task unpadded — a cliff number would be meaningless).
const BASELINE_PASS: f64 = 0.5;
/// A deeper rung is a cliff when its composite falls this far below the baseline.
const COLLAPSE_MARGIN: f64 = 0.2;
/// The needle is injected at these fractional depths — never tail-appended (that
/// tests recency, the model's strongest position). Mid-document is where it fails.
pub const DEFAULT_DEPTHS: [f32; 5] = [0.1, 0.3, 0.5, 0.7, 0.9];

/// One needle position within a rung: the composite there and the verified depth.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DepthScore {
    pub depth: f32,
    pub composite: Option<f64>,
    pub verified_tokens: u32,
}

/// One rung of the ladder: what depth was requested, the depth actually verified
/// from `prompt_eval_count`, the worst-position composite, and the per-position
/// breakdown. `composite`/`verified_tokens` are always the MEASURED values.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CliffPoint {
    pub target_tokens: u32,
    pub verified_tokens: u32,
    /// Worst composite across the swept positions — "passes across positions" means
    /// robust everywhere, so the cliff is found at the weakest spot, not the average.
    pub composite: Option<f64>,
    pub per_depth: Vec<DepthScore>,
}

/// The probe result: every rung, the classified status (mirrors the persisted
/// `CliffStatus`), and `cliff_tokens` — the largest VERIFIED context where the
/// task still passed across all positions.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CliffReport {
    pub points: Vec<CliffPoint>,
    pub status: CliffStatus,
    pub cliff_tokens: Option<u32>,
}

/// Run all tasks at one padding + one needle depth, returning each task's verdict
/// and measured prompt tokens. Empty padding ⇒ the unpadded baseline.
async fn run_position<M: ModelTurn>(
    turn: &M,
    model: &str,
    tasks: &[ToolTask],
    padding: &str,
    depth: f32,
) -> AppResult<Vec<TaskResult>> {
    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        let prompt = if padding.is_empty() {
            task.prompt.clone()
        } else {
            inject_at_depth(padding, &task.prompt, depth)
        };
        let spec = GenerateSpec {
            model: model.to_string(),
            prompt,
            system: Some(build_system_for(&task.tools)),
            // Greedy (temp 0) — a probe is a diagnostic and must reproduce. The live
            // command's BackendTurn carries num_ctx (so the padding isn't truncated);
            // this temp 0 is the seam fallback the scripted test model also sees.
            options: Some(GenerateOptions { temperature: Some(0.0), num_predict: Some(MAX_OUTPUT), ..Default::default() }),
            keep_alive: None,
        };
        let (raw, stats) = turn.run(&spec).await?;
        let verdict = score(&task.expected, extract_calls(&raw).as_deref());
        results.push(TaskResult {
            id: task.id.clone(),
            category: task.category.clone(),
            verdict,
            prompt_tokens: stats.prompt_eval_count,
        });
    }
    Ok(results)
}

/// Sweep every needle depth for one fixed padding. Returns the per-depth scores,
/// the mean verified token depth, and the worst-position composite.
async fn sweep<M: ModelTurn>(
    turn: &M,
    model: &str,
    tasks: &[ToolTask],
    padding: &str,
    depths: &[f32],
) -> AppResult<(Vec<DepthScore>, u32, Option<f64>)> {
    let mut per_depth = Vec::with_capacity(depths.len());
    let mut tok_sum: u64 = 0;
    let mut tok_n: u64 = 0;
    let mut worst: Option<f64> = None;
    for &depth in depths {
        let results = run_position(turn, model, tasks, padding, depth).await?;
        let report = aggregate(tasks, results);
        let vt = report.prompt_tokens.map(|t| t.round() as u32).unwrap_or(0);
        if let Some(t) = report.prompt_tokens {
            tok_sum += t.round() as u64;
            tok_n += 1;
        }
        if let Some(c) = report.composite {
            worst = Some(worst.map_or(c, |w: f64| w.min(c)));
        }
        per_depth.push(DepthScore { depth, composite: report.composite, verified_tokens: vt });
    }
    let mean_tokens = if tok_n > 0 { (tok_sum / tok_n) as u32 } else { 0 };
    Ok((per_depth, mean_tokens, worst))
}

/// Probe one rung: build padding for `target` tokens, verify the measured depth is
/// within ±5%, rebuilding proportionally up to `MAX_ADJUST_ATTEMPTS` times, then
/// report the rung at its VERIFIED token count (never the requested one).
async fn probe_rung<M: ModelTurn>(
    turn: &M,
    model: &str,
    tasks: &[ToolTask],
    source_text: &str,
    target: u32,
    depths: &[f32],
) -> AppResult<CliffPoint> {
    if target == 0 {
        // Baseline: unpadded, single position.
        let results = run_position(turn, model, tasks, "", 0.0).await?;
        let report = aggregate(tasks, results);
        let vt = report.prompt_tokens.map(|t| t.round() as u32).unwrap_or(0);
        return Ok(CliffPoint {
            target_tokens: 0,
            verified_tokens: vt,
            composite: report.composite,
            per_depth: vec![DepthScore { depth: 0.0, composite: report.composite, verified_tokens: vt }],
        });
    }
    let mut bytes = target as usize * BYTES_PER_TOKEN;
    let mut last: Option<(Vec<DepthScore>, u32, Option<f64>)> = None;
    for attempt in 0..=MAX_ADJUST_ATTEMPTS {
        let padding = build_padding(source_text, bytes);
        let (per_depth, mean_tokens, worst) = sweep(turn, model, tasks, &padding, depths).await?;
        let off = if target > 0 { (mean_tokens as f64 - target as f64).abs() / target as f64 } else { 0.0 };
        last = Some((per_depth, mean_tokens, worst));
        if mean_tokens == 0 || off <= ADJUST_TOLERANCE || attempt == MAX_ADJUST_ATTEMPTS {
            break;
        }
        // Rebuild proportionally: scale the byte seed toward the target.
        bytes = ((bytes as f64) * (target as f64) / (mean_tokens as f64)).round() as usize;
    }
    let (per_depth, mean_tokens, worst) = last.expect("loop runs at least once");
    Ok(CliffPoint { target_tokens: target, verified_tokens: mean_tokens, composite: worst, per_depth })
}

/// Classify the ladder into a `CliffStatus` plus `cliff_tokens` (largest verified
/// context that still passed across positions). Mirrors the frontend
/// `classifyCliff` contract: no baseline ⇒ Broken; first rung that drops
/// `COLLAPSE_MARGIN` below the baseline ⇒ Collapsed at that depth; otherwise NoCliff.
fn classify(points: &[CliffPoint]) -> (CliffStatus, Option<u32>) {
    let Some(base) = points.first() else {
        return (CliffStatus::NotProbed, None);
    };
    match base.composite {
        // Can't establish a baseline (no signal, or below the floor) — a cliff number
        // here would be a fabrication, so report Broken and no cliff token.
        None => return (CliffStatus::Broken { tested: base.verified_tokens }, None),
        Some(c) if c < BASELINE_PASS => return (CliffStatus::Broken { tested: base.verified_tokens }, None),
        Some(_) => {}
    }
    let base_comp = base.composite.expect("checked Some above");
    let mut largest_pass = base.verified_tokens;
    for p in &points[1..] {
        if let Some(c) = p.composite {
            if c <= base_comp - COLLAPSE_MARGIN {
                return (CliffStatus::Collapsed { depth: p.verified_tokens }, Some(largest_pass));
            }
            largest_pass = p.verified_tokens;
        }
    }
    let tested = points.last().map(|p| p.verified_tokens).unwrap_or(base.verified_tokens);
    (CliffStatus::NoCliff { tested }, Some(largest_pass))
}

/// Build an ascending token ladder from 0 (the unpadded baseline) up to
/// `max_tokens`, inclusive, across `steps` rungs. `[0, …, max_tokens]`.
pub fn build_ladder(max_tokens: u32, steps: u32) -> Vec<u32> {
    let steps = steps.max(2);
    (0..steps).map(|i| ((max_tokens as u64 * i as u64) / (steps as u64 - 1)) as u32).collect()
}

/// Run the full context-cliff probe: for each token rung (ascending; include 0 for
/// the unpadded baseline), sweep the needle across `depths`, verify the depth, and
/// classify where accuracy collapses. Tauri-free — the command supplies the
/// `ModelTurn` (with num_ctx large enough to fit the deepest rung) and persists the
/// result.
pub async fn run_cliff<M: ModelTurn>(
    turn: &M,
    model: &str,
    tasks: &[ToolTask],
    source: &CliffSource,
    ladder: &[u32],
    depths: &[f32],
) -> AppResult<CliffReport> {
    run_cliff_with(turn, model, tasks, source, ladder, depths, &mut |_, _, _| {}).await
}

/// Same as [`run_cliff`] but invokes `on_rung(done, total, point)` after each rung
/// completes — the seam the command layer uses to emit live progress events while
/// the engine stays UI-free.
pub async fn run_cliff_with<M: ModelTurn>(
    turn: &M,
    model: &str,
    tasks: &[ToolTask],
    source: &CliffSource,
    ladder: &[u32],
    depths: &[f32],
    on_rung: &mut (dyn FnMut(usize, usize, &CliffPoint) + Send),
) -> AppResult<CliffReport> {
    let source_text = source.text();
    let total = ladder.len();
    let mut points = Vec::with_capacity(total);
    for (i, &target) in ladder.iter().enumerate() {
        let point = probe_rung(turn, model, tasks, source_text, target, depths).await?;
        on_rung(i + 1, total, &point);
        points.push(point);
    }
    let (status, cliff_tokens) = classify(&points);
    Ok(CliffReport { points, status, cliff_tokens })
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
