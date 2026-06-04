use crate::inference::eval::agentic::sandbox::{EndStateRule, MockResponse};
use serde::{Deserialize, Serialize};

/// The agentic extension of a `ToolTask`: the deterministic sandbox mocks, the
/// success criterion, and optional Pass^k / step-cap overrides. Carried as an
/// optional field on `ToolTask` so one collection can mix single-turn and agentic
/// tasks and existing fixtures round-trip unchanged. The task's `prompt` is the
/// agent's initial prompt; its `tools` are the schemas injected into the system
/// prompt.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AgenticSpec {
    pub mocks: Vec<MockResponse>,
    pub end_state: EndStateRule,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_steps: Option<u32>,
}
