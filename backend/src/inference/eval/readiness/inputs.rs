use super::profile::ReadinessProfile;
use super::types::{AgentPath, CliffStatus, ModelVerdict, NativeFcStatus, Readiness, ReadinessInputs, ReadinessVerdict};
use super::verdict::assess;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::batch::{AggAgentic, BatchColumn, BatchReport, TierStat};
use crate::inference::gguf::gguf_quant::quant_from_filename;

/// The native-first agentic aggregate — the NATIVE pass when it actually ran (`total_runs
/// > 0`), else the prompt-based proxy. The single selector every readiness read shares, so
/// the gated metrics, the per-tier breakdown, and the failure taxonomy can never come from
/// different passes (native-FC defaults off, so both must fall back identically).
pub fn native_first_source(col: &BatchColumn) -> Option<&AggAgentic> {
    col.agentic_native_fc.as_ref().filter(|a| a.total_runs > 0).or(col.agentic.as_ref())
}

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
    let native_fc = match native {
        Some(n) => NativeFcStatus::Tested { pass_k: n.pass_k().unwrap_or(0.0) },
        None => NativeFcStatus::NotSupported,
    };
    let source = native_first_source(col);
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
            required_tier: profile.required_tier,
            cleared_tier: None, // an errored column measured nothing
        },
        None => assess(&from_column(col, fits_in_vram, vram_pressure, cliff), profile),
    }
}

/// Efficiency telemetry (avg_steps, effort) for the recommender ranking —
/// **native-first**, the exact aggregate the verdict gates on, so the recommender
/// praises the same telemetry the verdict was computed from (not the wrong column).
pub fn agentic_metrics(col: &BatchColumn) -> (Option<f64>, Option<f64>) {
    match native_first_source(col) {
        Some(a) => (a.avg_steps, a.avg_output_tokens_success),
        None => (None, None),
    }
}

/// The measured Pass^k the verdict gated on — **native-first**, as a raw fraction.
/// `None` when no agentic run produced data (the row then renders "N/A").
pub fn pass_k_of(col: &BatchColumn) -> Option<f64> {
    native_first_source(col).and_then(|a| a.pass_k())
}

/// Resolve a column's real quantization: the Ollama installed-models registry first,
/// else parse it from the model name (a GGUF / llama.cpp / MLX model, or Ollama
/// offline). NEVER fabricated — it's the quant the name actually encodes, the same one
/// the VerdictTable shows — so a publish row (which requires a quant) isn't dropped just
/// because the registry was unavailable. `None` only when neither source knows it.
pub fn resolve_quant(registry_hit: Option<String>, model: &str) -> Option<String> {
    registry_hit.or_else(|| quant_from_filename(model))
}

/// Union several per-tier ladders into one, keyed by `tier` (FIRST occurrence wins —
/// pass the authoritative list first), sorted ascending. Each built-in tier lives in
/// exactly one collection, so this is a pure union with NO per-tier re-averaging:
/// `avg_steps` and per-tier `failures` carry through verbatim. Powers the Agent
/// Report's per-domain Tier Progression Matrix, which accumulates across a domain's
/// tier-sibling collections.
pub fn merge_by_tier(lists: &[&[TierStat]]) -> Vec<TierStat> {
    let mut out: Vec<TierStat> = Vec::new();
    for list in lists {
        for ts in *list {
            if !out.iter().any(|e| e.tier == ts.tier) {
                out.push(ts.clone());
            }
        }
    }
    out.sort_by_key(|ts| ts.tier);
    out
}

/// A model's per-tier ladder merged across the same domain's tier-sibling reports.
/// `primary` (the selected collection's own native-first `by_tier`) wins on tier
/// collision; each sibling contributes ONLY its matching `(model, backend)` column —
/// so a different model's tiers are never pulled into this model's ladder (no
/// cross-model "Frankenstein ladder"). `(model, backend)` is the load-bearing key.
pub fn merged_by_tier_for(
    model: &str,
    backend: BackendKind,
    primary: &[TierStat],
    siblings: &[&BatchReport],
) -> Vec<TierStat> {
    let mut lists: Vec<&[TierStat]> = Vec::with_capacity(siblings.len() + 1);
    lists.push(primary);
    for r in siblings {
        if let Some(a) = r
            .columns
            .iter()
            .find(|c| c.model == model && c.backend == backend)
            .and_then(native_first_source)
        {
            lists.push(a.by_tier.as_slice());
        }
    }
    merge_by_tier(&lists)
}

/// Assess every model in a persisted batch report against a profile, with no
/// hardware facts (VRAM unmeasured). The CLI-without-cap and pure-test path.
pub fn assess_report(report: &BatchReport, profile: &ReadinessProfile) -> Vec<ModelVerdict> {
    report
        .columns
        .iter()
        .map(|col| {
            let (avg_steps, effort) = agentic_metrics(col);
            // Per-tier breakdown + failures from the SAME native-first source the verdict
            // gated on (so the Agent Report's Matrix/Taxonomy can't drift from the gate).
            let (by_tier, failures) =
                native_first_source(col).map(|a| (a.by_tier.clone(), a.failures.clone())).unwrap_or_default();
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
                by_tier,
                failures,
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "inputs_tests.rs"]
mod tests;
