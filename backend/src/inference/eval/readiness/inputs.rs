use super::profile::ReadinessProfile;
use super::types::{AgentPath, CliffStatus, ModelVerdict, NativeFcStatus, Readiness, ReadinessInputs, ReadinessVerdict};
use super::verdict::assess;
use crate::inference::eval::batch::{BatchColumn, BatchReport};

/// Build the measured inputs for `assess` from a Matrix column. Agentic metrics
/// come from the column; the hardware facts (`fits_in_vram`, `vram_pressure`) are
/// threaded in by the caller (the command computes them from the snapshot + cap;
/// the no-hardware path passes `None`/`false`). Unmeasured metrics stay
/// `None`/`NotSupported` — never a fabricated value.
pub fn from_column(
    col: &BatchColumn,
    fits_in_vram: Option<bool>,
    vram_pressure: bool,
    cliff: CliffStatus,
) -> ReadinessInputs {
    // Prefer the NATIVE aggregate when it was measured — that's the path a
    // production agent actually uses. Native present → source the gated metrics
    // from it and label the path NativeFc; otherwise the prompt-based proxy.
    let native = col.agentic_native_fc.as_ref().filter(|a| a.total_runs > 0);
    let (source, native_fc) = match native {
        Some(n) => (Some(n), NativeFcStatus::Tested { pass_k: n.pass_k().unwrap_or(0.0) }),
        None => (col.agentic.as_ref(), NativeFcStatus::NotSupported),
    };
    let pass_k = source.and_then(|a| a.pass_k());
    let (loops, hallucinated) = source
        .map(|a| (a.failures.infinite_loop_hits, a.failures.hallucinated_completions))
        .unwrap_or((0, 0));
    // Phase 9: per-tier strict Pass^k for the tier gate — from the SAME (native-first)
    // aggregate the other gates read, so the verdict is internally consistent.
    let tier_pass_k =
        source.map(|a| a.by_tier.iter().filter_map(|s| s.pass_k().map(|pk| (s.tier, pk))).collect()).unwrap_or_default();
    ReadinessInputs {
        pass_k,
        avg_steps: source.and_then(|a| a.avg_steps),
        ms_per_step: None, // Phase 7.4: route the StepEconomy per-step duration here
        cliff,             // context-cliff status (the command threads it in; NotProbed on the no-hardware path)
        fits_in_vram,
        vram_pressure,
        loops,
        hallucinated,
        native_fc,
        tier_pass_k,
    }
}

/// One column's verdict against a profile, with the hardware facts + measured cliff
/// threaded in. An errored column short-circuits to NotReady carrying the real run
/// error — we never synthesize a score for a column that failed to produce data.
/// The single home for the error/assess branch, shared by `assess_report` (no
/// hardware/cliff) and the hardware-aware command.
pub fn verdict_for(
    col: &BatchColumn,
    fits_in_vram: Option<bool>,
    vram_pressure: bool,
    cliff: CliffStatus,
    profile: &ReadinessProfile,
) -> ReadinessVerdict {
    match &col.error {
        Some(err) => ReadinessVerdict {
            status: Readiness::NotReady,
            blocking: vec![format!("run error: {err}")],
            conditions: Vec::new(),
            path: AgentPath::PromptBased,
        },
        None => assess(&from_column(col, fits_in_vram, vram_pressure, cliff), profile),
    }
}

/// Efficiency telemetry (avg_steps, effort) for the recommender ranking —
/// **native-first**, the exact aggregate the verdict gates on, so the recommender
/// praises the same telemetry the verdict was computed from (not the wrong column).
pub fn agentic_metrics(col: &BatchColumn) -> (Option<f64>, Option<f64>) {
    if let Some(n) = &col.agentic_native_fc {
        if n.total_runs > 0 {
            return (n.avg_steps, n.avg_output_tokens_success);
        }
    }
    match &col.agentic {
        Some(a) => (a.avg_steps, a.avg_output_tokens_success),
        None => (None, None),
    }
}

/// The measured Pass^k the verdict gated on — **native-first**, as a raw fraction.
/// `None` when no agentic run produced data (the row then renders "N/A").
pub fn pass_k_of(col: &BatchColumn) -> Option<f64> {
    let source = col
        .agentic_native_fc
        .as_ref()
        .filter(|a| a.total_runs > 0)
        .or(col.agentic.as_ref());
    source.and_then(|a| a.pass_k())
}

/// Assess every model in a persisted batch report against a profile, with no
/// hardware facts (VRAM unmeasured). The CLI-without-cap and pure-test path.
pub fn assess_report(report: &BatchReport, profile: &ReadinessProfile) -> Vec<ModelVerdict> {
    report
        .columns
        .iter()
        .map(|col| {
            let (avg_steps, effort) = agentic_metrics(col);
            ModelVerdict {
                model: col.model.clone(),
                backend: col.backend,
                verdict: verdict_for(col, None, false, CliffStatus::NotProbed, profile),
                memory: None,
                avg_steps,
                effort,
                pass_k: pass_k_of(col),
                quantization: None, // the no-hardware path has no registry to read the real quant
                cliff: CliffStatus::NotProbed, // the no-hardware/CLI path has no cliff store to read
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "inputs_tests.rs"]
mod tests;
