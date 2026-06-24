use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// One STT eval task — a pure **text instruction set**, joined to a stored
/// `Transcript` by `id` (never an audio blob; the id is the single source of
/// truth, so the spec can't drift from the artifact). `reference` absent → the
/// task is scored behavioral-only (WER stays `None`, "accuracy unverified").
/// `critical_tokens` carry extra weight in the weighted WER — a missed dollar
/// amount must outweigh a missed "the" (the financial/legal core).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttEvalTask {
    pub id: String,
    #[serde(default)]
    pub reference: Option<String>,
    #[serde(default)]
    pub critical_tokens: Vec<String>,
}

/// An eval spec is a list of tasks (a single-task eval is a 1-element batch).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct SttEvalSpec {
    pub tasks: Vec<SttEvalTask>,
}

impl SttEvalSpec {
    /// Validate before a run: non-empty, every task id non-empty **and unique**.
    /// Rows join transcripts by id, so a duplicate would silently double-score one
    /// transcript (or shadow another) — reject it up front.
    pub fn validate(&self) -> AppResult<()> {
        if self.tasks.is_empty() {
            return Err(AppError::Validation("eval spec has no tasks".into()));
        }
        let mut seen = HashSet::new();
        for t in &self.tasks {
            if t.id.trim().is_empty() {
                return Err(AppError::Validation("an eval task has an empty id".into()));
            }
            if !seen.insert(t.id.as_str()) {
                return Err(AppError::Validation(format!("duplicate eval task id: {}", t.id)));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str) -> SttEvalTask {
        SttEvalTask { id: id.into(), reference: None, critical_tokens: vec![] }
    }

    #[test]
    fn a_valid_spec_with_unique_ids_passes() {
        let spec = SttEvalSpec { tasks: vec![task("a"), task("b")] };
        assert!(spec.validate().is_ok());
    }

    #[test]
    fn an_empty_spec_is_rejected() {
        assert!(SttEvalSpec::default().validate().is_err());
    }

    #[test]
    fn an_empty_task_id_is_rejected() {
        let spec = SttEvalSpec { tasks: vec![task("  ")] };
        assert!(spec.validate().is_err());
    }

    #[test]
    fn a_duplicate_task_id_is_rejected() {
        // The id is the join key — a dup would silently double-score one transcript.
        let spec = SttEvalSpec { tasks: vec![task("dup"), task("dup")] };
        let err = spec.validate().unwrap_err();
        assert!(format!("{err:?}").contains("duplicate"), "got {err:?}");
    }

    #[test]
    fn reference_and_critical_tokens_default_when_absent() {
        // A bare `{ "id": "x" }` must parse — reference None, no critical tokens.
        let t: SttEvalTask = serde_json::from_str(r#"{"id":"x"}"#).unwrap();
        assert_eq!(t.reference, None);
        assert!(t.critical_tokens.is_empty());
    }
}
