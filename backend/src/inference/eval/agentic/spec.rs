use crate::inference::eval::agentic::sandbox::{EndStateRule, MockResponse};
use crate::inference::eval::toolcall::tasks::Call;
use serde::{Deserialize, Serialize};

/// A Driver-B lazy-agent trap: how a specific mocked call fails before it would
/// succeed. `TransientError` clears after `clears_after` attempts (a robust agent
/// retries through it); `PersistentError` never clears (a robust agent reports the
/// failure instead of faking completion). The `status_code` only colors the
/// injected error text — the behavior is driven by the variant.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FaultInjection {
    TransientError { status_code: u16, clears_after: u8 },
    PersistentError { status_code: u16 },
}

/// Binds a fault to the exact call that should trip it. The sandbox keys faults by
/// `canonical(call)` so arg ordering is irrelevant and multi-tool tasks track each
/// fault independently.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FaultRule {
    pub call: Call,
    pub fault: FaultInjection,
}

/// The agentic extension of a `ToolTask`: the deterministic sandbox mocks, the
/// success criterion, optional Pass^k / step-cap overrides, the fault traps, and
/// the semantic-recovery budget. Carried as an optional field on `ToolTask` so one
/// collection can mix single-turn and agentic tasks and existing fixtures
/// round-trip unchanged. The task's `prompt` is the agent's initial prompt; its
/// `tools` are the schemas injected into the system prompt.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AgenticSpec {
    pub mocks: Vec<MockResponse>,
    pub end_state: EndStateRule,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_steps: Option<u32>,
    /// Driver B: lazy-agent traps. Empty for a fault-free task (existing fixtures
    /// stay byte-identical on save).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub faults: Vec<FaultRule>,
    /// Driver D: how many semantic schema errors the model may recover from before
    /// the run is scored `MalformedSchema`. `None` falls back to the engine default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_recovery: Option<u8>,
}
