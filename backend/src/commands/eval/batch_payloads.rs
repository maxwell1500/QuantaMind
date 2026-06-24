use crate::inference::eval::agentic::step::TrajectoryStep;
use crate::inference::eval::batch::{BatchReport, TaskOutcome};
use serde::Serialize;

pub const EVENT_BATCH_PROGRESS: &str = "batch-progress";
pub const EVENT_AGENTIC_STEP: &str = "agentic-step";
pub const EVENT_BATCH_COMPLETE: &str = "batch-complete";

/// Per-task progress on the single `batch-progress` stream the frontend listens
/// to once. `Started` carries `total` (sizes the progress bar); `Done` carries
/// the task's outcome (cached for the trace debugger).
#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum BatchProgress {
    Started { model: String, task_id: String, index: usize, total: usize, category: String },
    Done { model: String, task_id: String, outcome: TaskOutcome },
}

/// A live agentic turn, tagged so the trace debugger routes it to the right
/// (model, task) trajectory.
#[derive(Serialize, Clone)]
pub struct AgenticStepPayload {
    pub model: String,
    pub task_id: String,
    #[serde(flatten)]
    pub step: TrajectoryStep,
}

#[derive(Serialize, Clone)]
pub struct BatchCompletePayload {
    pub report: BatchReport,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::env_view::{EnvView, FsNode, FsOp, FsView};
    use crate::inference::eval::agentic::step::StepKind;

    #[test]
    fn agentic_step_payload_carries_env_at_the_top_level_for_the_frontend() {
        // The frontend destructures `{model, task_id, ...step}` and reads `step.env`. With
        // `#[serde(flatten)]`, the step fields (INCLUDING env) must appear at the payload's top
        // level, and env must serialize as the internally-tagged object the Zod schema expects.
        let payload = AgenticStepPayload {
            model: "m".into(),
            task_id: "t".into(),
            step: TrajectoryStep {
                run_index: 0,
                step_index: 1,
                raw_output: String::new(),
                injection: None,
                kind: StepKind::ToolCall,
                env: EnvView::FileSystem(FsView {
                    tree: vec![FsNode { path: "config.yaml".into(), is_dir: false }],
                    focus_path: Some("config.yaml".into()),
                    op: FsOp::Read,
                    content: Some("timeout: 30".into()),
                    matches: vec![],
                }),
            },
        };
        let v = serde_json::to_value(&payload).unwrap();
        // Flattened: step fields at top level.
        assert_eq!(v["kind"], "tool_call");
        assert_eq!(v["run_index"], 0);
        // env present and tagged.
        assert_eq!(v["env"]["kind"], "file_system");
        assert_eq!(v["env"]["op"], "read");
        assert_eq!(v["env"]["content"], "timeout: 30");
        assert_eq!(v["env"]["focus_path"], "config.yaml");
    }
}
