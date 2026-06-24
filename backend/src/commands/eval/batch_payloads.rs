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
