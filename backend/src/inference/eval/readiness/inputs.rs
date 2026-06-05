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
    let ag = col.agentic.as_ref();
    let pass_k = ag.and_then(|a| (a.total_runs > 0).then(|| a.passes as f64 / a.total_runs as f64));
    let (loops, hallucinated) = ag
        .map(|a| (a.failures.infinite_loop_hits, a.failures.hallucinated_completions))
        .unwrap_or((0, 0));
    ReadinessInputs {
        pass_k,
        avg_steps: ag.and_then(|a| a.avg_steps),
        ms_per_step: None,  // Phase 7.4: route the StepEconomy per-step duration here
        cliff_tokens: None, // Phase 7: wire the context-cliff probe (frontend-only today)
        fits_in_vram,
        vram_pressure,
        loops,
        hallucinated,
        native_fc: NativeFcStatus::NotSupported, // Phase 7.2: native function-calling path
    }
}

/// Assess every model in a persisted batch report against a profile. An errored
/// column short-circuits to NotReady carrying the real run error — we never
/// synthesize a score for a column that failed to produce data.
pub fn assess_report(report: &BatchReport, profile: &ReadinessProfile) -> Vec<ModelVerdict> {
    report
        .columns
        .iter()
        .map(|col| {
            let verdict = match &col.error {
                Some(err) => ReadinessVerdict {
                    status: Readiness::NotReady,
                    blocking: vec![format!("run error: {err}")],
                    conditions: Vec::new(),
                    path: AgentPath::PromptBased,
                },
                None => assess(&from_column(col, None, false), profile),
            };
            ModelVerdict { model: col.model.clone(), backend: col.backend, verdict, memory: None }
        })
        .collect()
}

#[cfg(test)]
#[path = "inputs_tests.rs"]
mod tests;
