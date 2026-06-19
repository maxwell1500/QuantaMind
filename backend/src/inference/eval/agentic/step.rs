use serde::Serialize;

/// What happened on a single agent turn — drives the Trajectory Inspector's
/// per-step rendering and its red highlights for the error kinds.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StepKind {
    /// A valid call the sandbox recognized and answered.
    ToolCall,
    /// A recognized call the sandbox deliberately failed (Driver-B fault trap): an
    /// HTTP-style error is injected and the loop continues so a robust agent can
    /// retry (transient) or report the failure (persistent).
    ToolError,
    /// A parsed call the sandbox has no mock for (unknown tool or wrong args) — an
    /// error is injected and the loop continues.
    UnknownTool,
    /// Driver D: a schema-invalid call (missing required param / wrong type /
    /// unknown tool). A precise semantic correction is injected for recovery; the
    /// terminal SchemaError turn (no injection) means the recovery budget ran out.
    SchemaError,
    /// The model yielded with broken JSON where a call was attempted.
    MalformedJson,
    /// The model yielded (no call) without satisfying the EndStateRule — a fake
    /// "I'm done" (the lazy-agent failure).
    HallucinatedCompletion,
    /// The EndStateRule was satisfied — the success terminal.
    EndStateReached,
    /// The step cap was hit without success.
    InfiniteLoop,
    /// Phase 9-v2: the model invoked a `must_not_call` trap — terminal the instant
    /// it fires (the forbidden action never "happens").
    ForbiddenCall,
}

/// One turn of an agentic run, streamed to the UI as it happens. `injection` is
/// the sandbox's text reply for this turn (`"Tool result: …"`), or `None` on a
/// terminal turn (end-state, yield, or loop cap).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TrajectoryStep {
    pub run_index: u32,
    pub step_index: u32,
    pub raw_output: String,
    pub injection: Option<String>,
    pub kind: StepKind,
}
