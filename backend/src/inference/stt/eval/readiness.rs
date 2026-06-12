use crate::inference::eval::readiness::types::Readiness;
use crate::inference::eval::readiness::vram_fit::MemoryProfile;
use crate::inference::stt::eval::report::{SttReport, SttReportRow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Transcription-readiness gating thresholds (parallels the text `ReadinessProfile`).
/// Soft targets are `Option` (unset → silent); the WER gate is **reference-gated**.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttReadinessProfile {
    pub id: String,
    pub name: String,
    /// Speed floor — RTF below this blocks (a slow model is a hard fail, not a vague one).
    pub min_rtf: Option<f64>,
    /// **Weighted** WER ceiling (a "weighted error budget" — critical-token errors
    /// count extra). Only gates when WER is measured (reference present).
    pub max_wer: Option<f64>,
    pub max_repeat_rate: Option<f64>,
    pub max_silence_rate: Option<f64>,
    pub min_confidence: Option<f64>,
    pub require_vram_fit: bool,
}

/// One model's measured inputs (aggregated from its `SttReport` rows).
/// `weighted_wer` is the **critical-token-weighted** WER — the figure `max_wer`
/// gates on (a wrong dollar amount/payee dominates; equals the raw WER when a task
/// has no critical tokens). `None` when the run had no reference — accuracy is
/// unverified, never fabricated.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct SttReadinessInputs {
    pub rtf: Option<f64>,
    pub weighted_wer: Option<f64>,
    pub repeat_rate: Option<f64>,
    pub silence_rate: Option<f64>,
    pub confidence: Option<f64>,
    pub fits_in_vram: Option<bool>,
    pub vram_pressure: bool,
}

/// Parallels `ReadinessVerdict` but without the agentic `path`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttReadinessVerdict {
    pub status: Readiness,
    pub blocking: Vec<String>,
    pub conditions: Vec<String>,
}

/// **Pure** synthesis: measured inputs + a profile → a verdict. No async, no I/O —
/// the single source of truth shared by the GUI command and the CLI (identical
/// contract to the text `assess()` so they can't diverge). Hard gates → `blocking`
/// (NotReady); soft targets → `conditions` (Conditional); required-but-unmeasured blocks.
pub fn assess(i: &SttReadinessInputs, p: &SttReadinessProfile) -> SttReadinessVerdict {
    let mut blocking = Vec::new();
    let mut conditions = Vec::new();

    // Speed (hard): required-but-unmeasured blocks — ignorance is not a pass.
    if let Some(min) = p.min_rtf {
        match i.rtf {
            None => blocking.push("speed (RTF) required but not measured".into()),
            Some(r) if r < min => blocking.push(format!("too slow: RTF {r:.2} < {min:.2} required")),
            Some(_) => {}
        }
    }

    // Accuracy (hard, **reference-gated**): gates on the **weighted** WER (a wrong
    // critical token — a dollar amount, a payee — dominates). Fires ONLY when WER is
    // measured: a `None` (no reference) can never pass or fail on accuracy — when the
    // profile wants accuracy but there's no reference it's an honest Conditional note,
    // never a block and never a silent pass.
    if let Some(max) = p.max_wer {
        match i.weighted_wer {
            Some(w) if w > max => {
                blocking.push(format!("weighted WER {:.1}% > {:.1}% allowed", w * 100.0, max * 100.0))
            }
            Some(_) => {}
            None => conditions.push("accuracy unverified (no reference text)".into()),
        }
    }

    // VRAM fit (hard when required) — mirrors `require_full_vram`.
    if p.require_vram_fit {
        match i.fits_in_vram {
            Some(false) => blocking.push("does not fit in VRAM → partial offload".into()),
            None => blocking.push("require_vram_fit set, but VRAM fit not measured".into()),
            Some(true) => {}
        }
    }
    if i.vram_pressure {
        conditions.push("high VRAM pressure near allocation ceiling".into());
    }

    // Behavioral soft targets → Conditional on breach only; unmeasured is silent.
    if let (Some(max), Some(r)) = (p.max_repeat_rate, i.repeat_rate) {
        if r > max {
            conditions.push(format!("repeats: {:.1}% > {:.1}% target", r * 100.0, max * 100.0));
        }
    }
    if let (Some(max), Some(s)) = (p.max_silence_rate, i.silence_rate) {
        if s > max {
            conditions.push(format!("speaks over silence: {:.1}% > {:.1}% target", s * 100.0, max * 100.0));
        }
    }
    if let (Some(min), Some(c)) = (p.min_confidence, i.confidence) {
        if c < min {
            conditions.push(format!("low confidence: {c:.2} < {min:.2} target"));
        }
    }

    let status = if !blocking.is_empty() {
        Readiness::NotReady
    } else if !conditions.is_empty() {
        Readiness::Conditional
    } else {
        Readiness::Ready
    };
    SttReadinessVerdict { status, blocking, conditions }
}

/// One model's readiness row (parallels `ModelVerdict`; STT-shaped, no agentic fields).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttModelVerdict {
    pub model: String,
    pub verdict: SttReadinessVerdict,
    pub rtf: Option<f64>,
    /// Raw WER (for display).
    pub wer: Option<f64>,
    /// The weighted WER the verdict actually gated on.
    pub weighted_wer: Option<f64>,
    pub repeat_rate: Option<f64>,
    pub silence_rate: Option<f64>,
    pub confidence: Option<f64>,
    pub memory: Option<MemoryProfile>,
}

/// Built-in presets, seeded on first list (like the text readiness profiles).
pub fn builtin_profiles() -> Vec<SttReadinessProfile> {
    vec![
        SttReadinessProfile {
            id: "production-dictation".into(),
            name: "Production dictation".into(),
            min_rtf: Some(1.0),
            max_wer: Some(0.10),
            max_repeat_rate: Some(0.05),
            max_silence_rate: Some(0.02),
            min_confidence: Some(0.70),
            require_vram_fit: false,
        },
        SttReadinessProfile {
            id: "high-accuracy-legal".into(),
            name: "High accuracy (legal/financial)".into(),
            min_rtf: None,
            max_wer: Some(0.05),
            max_repeat_rate: Some(0.02),
            max_silence_rate: Some(0.01),
            min_confidence: Some(0.85),
            require_vram_fit: false,
        },
        SttReadinessProfile {
            id: "fast-draft".into(),
            name: "Fast draft".into(),
            min_rtf: Some(3.0),
            max_wer: Some(0.20),
            max_repeat_rate: None,
            max_silence_rate: None,
            min_confidence: None,
            require_vram_fit: false,
        },
    ]
}

/// Mean of the measured values, `None` when none are measured (never coerced to
/// 0 — the conditional-denominator discipline).
fn mean<I: IntoIterator<Item = Option<f64>>>(it: I) -> Option<f64> {
    let v: Vec<f64> = it.into_iter().flatten().collect();
    (!v.is_empty()).then(|| v.iter().sum::<f64>() / v.len() as f64)
}

/// Aggregate a report into one verdict per model and assess each — **pure** (the
/// command only loads the report + profile). Per-model metrics are means over that
/// model's rows; `weighted_wer` averages only the rows that carried a reference, so
/// a reference-less run leaves it `None` ("accuracy unverified"), never fabricated.
/// Ranked best-first (Ready → Conditional → NotReady).
pub fn verdicts(report: &SttReport, profile: &SttReadinessProfile) -> Vec<SttModelVerdict> {
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<&str, Vec<&SttReportRow>> = HashMap::new();
    for r in &report.rows {
        if !groups.contains_key(r.model.as_str()) {
            order.push(r.model.clone());
        }
        groups.entry(r.model.as_str()).or_default().push(r);
    }

    let mut out: Vec<SttModelVerdict> = order
        .iter()
        .map(|model| {
            let rows = &groups[model.as_str()];
            let rtf = mean(rows.iter().map(|r| r.rtf));
            let raw_wer = mean(rows.iter().map(|r| r.wer.as_ref().map(|w| w.wer)));
            let weighted_wer = mean(rows.iter().map(|r| r.wer.as_ref().map(|w| w.weighted_wer)));
            let repeat_rate = mean(rows.iter().map(|r| r.repeat_rate));
            let silence_rate = mean(rows.iter().map(|r| r.silence_rate));
            let confidence = mean(rows.iter().map(|r| r.confidence));
            let inputs = SttReadinessInputs {
                rtf,
                weighted_wer,
                repeat_rate,
                silence_rate,
                confidence,
                fits_in_vram: None, // whisper.cpp doesn't report VRAM
                vram_pressure: false,
            };
            SttModelVerdict {
                model: model.clone(),
                verdict: assess(&inputs, profile),
                rtf,
                wer: raw_wer,
                weighted_wer,
                repeat_rate,
                silence_rate,
                confidence,
                memory: None,
            }
        })
        .collect();
    out.sort_by_key(|v| match v.verdict.status {
        Readiness::Ready => 0,
        Readiness::Conditional => 1,
        Readiness::NotReady => 2,
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::eval::wer::WerResult;

    fn profile() -> SttReadinessProfile {
        SttReadinessProfile {
            id: "p".into(),
            name: "p".into(),
            min_rtf: Some(1.0),
            max_wer: Some(0.10),
            max_repeat_rate: Some(0.05),
            max_silence_rate: Some(0.02),
            min_confidence: Some(0.70),
            require_vram_fit: false,
        }
    }
    fn clean() -> SttReadinessInputs {
        SttReadinessInputs {
            rtf: Some(2.0),
            weighted_wer: Some(0.0),
            repeat_rate: Some(0.0),
            silence_rate: Some(0.0),
            confidence: Some(0.9),
            fits_in_vram: None,
            vram_pressure: false,
        }
    }

    #[test]
    fn a_perfect_run_with_a_reference_is_ready() {
        assert_eq!(assess(&clean(), &profile()).status, Readiness::Ready);
    }

    #[test]
    fn no_reference_is_accuracy_unverified_not_a_fail_and_doesnt_bleed() {
        // The crux: WER None must NOT block, must NOT pass on accuracy, and must NOT
        // flip other (clean) gates. It downgrades to Conditional with an honest note.
        let i = SttReadinessInputs { weighted_wer: None, ..clean() };
        let v = assess(&i, &profile());
        assert_eq!(v.status, Readiness::Conditional);
        assert!(v.blocking.is_empty(), "missing accuracy never blocks: {:?}", v.blocking);
        assert_eq!(v.conditions, vec!["accuracy unverified (no reference text)".to_string()]);
    }

    #[test]
    fn too_slow_puts_the_speed_gate_in_blocking() {
        let i = SttReadinessInputs { rtf: Some(0.5), ..clean() };
        let v = assess(&i, &profile());
        assert_eq!(v.status, Readiness::NotReady);
        assert!(v.blocking.iter().any(|b| b.contains("too slow")), "{:?}", v.blocking);
    }

    #[test]
    fn wer_above_the_ceiling_blocks_only_when_measured() {
        let i = SttReadinessInputs { weighted_wer: Some(0.30), ..clean() };
        let v = assess(&i, &profile());
        assert_eq!(v.status, Readiness::NotReady);
        assert!(v.blocking.iter().any(|b| b.contains("weighted WER")), "{:?}", v.blocking);
    }

    #[test]
    fn require_vram_fit_blocks_when_fit_is_unmeasured() {
        let p = SttReadinessProfile { require_vram_fit: true, ..profile() };
        let i = SttReadinessInputs { fits_in_vram: None, ..clean() };
        assert_eq!(assess(&i, &p).status, Readiness::NotReady);
    }

    #[test]
    fn a_behavioral_breach_is_a_soft_condition() {
        let i = SttReadinessInputs { repeat_rate: Some(0.5), ..clean() };
        let v = assess(&i, &profile());
        assert_eq!(v.status, Readiness::Conditional);
        assert!(v.conditions.iter().any(|c| c.contains("repeats")));
    }

    fn row(model: &str, weighted: Option<f64>) -> SttReportRow {
        SttReportRow {
            task_id: "t".into(),
            model: model.into(),
            rtf: Some(2.0),
            repeat_rate: Some(0.0),
            silence_rate: Some(0.0),
            confidence: Some(0.9),
            wer: weighted.map(|w| WerResult {
                wer: w,
                weighted_wer: w,
                adjusted_wer: w,
                substitutions: 0,
                insertions: 0,
                deletions: 0,
                ref_words: 10,
                critical_token_accuracy: None,
                misreads: vec![],
            }),
        }
    }

    #[test]
    fn verdicts_aggregate_per_model_and_rank_best_first() {
        // model-bad has a high weighted WER → NotReady; model-good is clean → Ready.
        // The reference-less row leaves model-good's weighted_wer driven only by its
        // referenced row (here perfect) — a None never coerced into the mean.
        let report = SttReport {
            rows: vec![row("model-bad", Some(0.30)), row("model-good", Some(0.0)), row("model-good", None)],
        };
        let v = verdicts(&report, &profile());
        assert_eq!(v.len(), 2);
        // Ranked best-first.
        assert_eq!(v[0].model, "model-good");
        assert_eq!(v[0].verdict.status, Readiness::Ready);
        assert_eq!(v[0].weighted_wer, Some(0.0), "the None row didn't drag the mean");
        assert_eq!(v[1].model, "model-bad");
        assert_eq!(v[1].verdict.status, Readiness::NotReady);
    }
}
