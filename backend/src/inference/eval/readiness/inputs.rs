use super::profile::ReadinessProfile;
use super::types::{AgentPath, ModelVerdict, NativeFcStatus, Readiness, ReadinessInputs, ReadinessVerdict};
use super::verdict::assess;
use crate::inference::eval::batch::{BatchColumn, BatchReport};

/// Build the measured inputs for `assess` from a Matrix column. Agentic metrics
/// come from the column; the hardware facts (`fits_in_vram`, `vram_pressure`) are
/// threaded in by the caller (the command computes them from the snapshot + cap;
/// the no-hardware path passes `None`/`false`). Unmeasured metrics stay
/// `None`/`NotSupported` — never a fabricated value.
pub fn from_column(col: &BatchColumn, fits_in_vram: Option<bool>, vram_pressure: bool) -> ReadinessInputs {
    // Prefer the NATIVE aggregate when it was measured — that's the path a
    // production agent actually uses. Native present → source the gated metrics
    // from it and label the path NativeFc; otherwise the prompt-based proxy.
    let native = col.agentic_native_fc.as_ref().filter(|a| a.total_runs > 0);
    let (source, native_fc) = match native {
        Some(n) => (Some(n), NativeFcStatus::Tested { pass_k: n.passes as f64 / n.total_runs as f64 }),
        None => (col.agentic.as_ref(), NativeFcStatus::NotSupported),
    };
    let pass_k = source.and_then(|a| (a.total_runs > 0).then(|| a.passes as f64 / a.total_runs as f64));
    let (loops, hallucinated) = source
        .map(|a| (a.failures.infinite_loop_hits, a.failures.hallucinated_completions))
        .unwrap_or((0, 0));
    ReadinessInputs {
        pass_k,
        avg_steps: source.and_then(|a| a.avg_steps),
        ms_per_step: None,  // Phase 7.4: route the StepEconomy per-step duration here
        cliff_tokens: None, // Phase 7: wire the context-cliff probe (frontend-only today)
        fits_in_vram,
        vram_pressure,
        loops,
        hallucinated,
        native_fc,
    }
}

/// One column's verdict against a profile, with the hardware facts threaded in.
/// An errored column short-circuits to NotReady carrying the real run error — we
/// never synthesize a score for a column that failed to produce data. The single
/// home for the error/assess branch, shared by `assess_report` (no hardware) and
/// the hardware-aware command.
pub fn verdict_for(
    col: &BatchColumn,
    fits_in_vram: Option<bool>,
    vram_pressure: bool,
    profile: &ReadinessProfile,
) -> ReadinessVerdict {
    match &col.error {
        Some(err) => ReadinessVerdict {
            status: Readiness::NotReady,
            blocking: vec![format!("run error: {err}")],
            conditions: Vec::new(),
            path: AgentPath::PromptBased,
        },
        None => assess(&from_column(col, fits_in_vram, vram_pressure), profile),
    }
}

/// Assess every model in a persisted batch report against a profile, with no
/// hardware facts (VRAM unmeasured). The CLI-without-cap and pure-test path.
pub fn assess_report(report: &BatchReport, profile: &ReadinessProfile) -> Vec<ModelVerdict> {
    report
        .columns
        .iter()
        .map(|col| ModelVerdict {
            model: col.model.clone(),
            backend: col.backend,
            verdict: verdict_for(col, None, false, profile),
            memory: None,
        })
        .collect()
}

#[cfg(test)]
#[path = "inputs_tests.rs"]
mod tests;
