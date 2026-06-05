use super::profile::ReadinessProfile;
use super::types::{AgentPath, NativeFcStatus, Readiness, ReadinessInputs, ReadinessVerdict, EPSILON};

/// Pure synthesis: measured inputs + a profile → a verdict. No async, no I/O —
/// the single source of truth shared by the GUI command and the future CLI.
/// Hard gates push to `blocking` (→ NotReady); soft targets push to `conditions`
/// (→ Conditional). A required-but-unmeasured metric blocks: ignorance is not a pass.
pub fn assess(i: &ReadinessInputs, p: &ReadinessProfile) -> ReadinessVerdict {
    let mut blocking = Vec::new();
    let mut conditions = Vec::new();

    // Core hard gate: Pass^k must be measured and meet the bar (epsilon-guarded).
    match i.pass_k {
        None => blocking.push("pass^k not measured (no agentic runs) — cannot certify".into()),
        Some(pk) if pk < p.min_pass_k - EPSILON => {
            blocking.push(format!("pass^k {:.2} < {:.2} required", pk, p.min_pass_k));
        }
        Some(_) => {}
    }

    // Failure-taxonomy hard gates (counts are always known when agentic ran).
    if p.forbid_infinite_loop && i.loops > 0 {
        blocking.push("loops on some runs".into());
    }
    if p.forbid_hallucinated_completion && i.hallucinated > 0 {
        blocking.push("false 'done' on some runs".into());
    }

    // Hardware hard gate (strict null-gating: required ⇒ unmeasured blocks).
    if p.require_full_vram {
        match i.fits_in_vram {
            Some(false) => blocking.push("partial offload → severe slowdown".into()),
            None => blocking.push("require_full_vram set, but VRAM fit not measured".into()),
            Some(true) => {}
        }
    }

    // Context-cliff hard gate (only when the profile demands headroom).
    if let Some(min_tok) = p.min_context_tokens {
        match i.cliff_tokens {
            Some(t) if t < min_tok => {
                blocking.push(format!("reasoning cliff at {} < {} needed", t, min_tok));
            }
            None => blocking.push(format!("context headroom required ({} tok) but not measured", min_tok)),
            Some(_) => {}
        }
    }

    // Soft targets → Conditional on breach; a "not measured" note otherwise.
    if let Some(mx) = p.max_ms_per_step {
        match i.ms_per_step {
            Some(ms) if ms > mx => conditions.push(format!("slow: {}ms/step > {}ms target", ms, mx)),
            None => conditions.push("latency not measured on this run".into()),
            Some(_) => {}
        }
    }
    if let (Some(mx), Some(s)) = (p.max_avg_steps, i.avg_steps) {
        if s > mx {
            conditions.push(format!("inefficient: {:.1} avg steps > {:.1} max", s, mx));
        }
    }

    // Native-FC: hard gate only when the profile requires it. Otherwise the
    // `path` label below carries the "prompt-based proxy" transparency — we do
    // NOT force every prompt-based model to Conditional (it would make a clean
    // model uncertifiable until 7.2 lands).
    if matches!(i.native_fc, NativeFcStatus::NotSupported) && p.require_native_fc {
        blocking.push("native tool-calling required but not supported/measured on this backend".into());
    }

    let path = match i.native_fc {
        NativeFcStatus::Tested { .. } => AgentPath::NativeFc,
        NativeFcStatus::NotSupported => AgentPath::PromptBased,
    };
    let status = if !blocking.is_empty() {
        Readiness::NotReady
    } else if !conditions.is_empty() {
        Readiness::Conditional
    } else {
        Readiness::Ready
    };
    ReadinessVerdict { status, blocking, conditions, path }
}

#[cfg(test)]
#[path = "verdict_tests.rs"]
mod tests;
