/// How a single agentic run failed. Each maps to exactly one `FailureTracker`
/// tally so the categories never overlap.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailureKind {
    /// Hit the step cap without reaching the end state.
    InfiniteLoop,
    /// Yielded claiming completion without satisfying the EndStateRule.
    Hallucinated,
    /// Yielded with broken JSON where a call was attempted.
    Malformed,
}

/// The result of ONE agentic attempt — the unit the Pass^k loop folds into an
/// `AgenticReport`. `output_tokens` is the cumulative `eval_count` for this run
/// (output tokens only; prompt tokens are deliberately never summed).
#[derive(Clone, Debug, PartialEq)]
pub struct RunOutcome {
    pub reached_end: bool,
    pub steps: u32,
    pub output_tokens: u32,
    pub failure: Option<FailureKind>,
}

impl RunOutcome {
    pub fn success(steps: u32, output_tokens: u32) -> Self {
        Self { reached_end: true, steps, output_tokens, failure: None }
    }

    pub fn failure(steps: u32, output_tokens: u32, failure: FailureKind) -> Self {
        Self { reached_end: false, steps, output_tokens, failure: Some(failure) }
    }
}
