use serde::Deserialize;
use serde_json::Value;

/// A tool the model may call: name, a one-line description, and a JSON-Schema
/// `parameters` object (`{ "type": "object", "properties": {…}, "required": […] }`)
/// — the shape developers paste from their real tool definitions.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// A concrete tool call: a tool name + its argument object.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Call {
    pub name: String,
    pub args: Value,
}

/// What a correct model should do. `no_call` = the prompt needs no tool
/// (abstention). Internally tagged for readable fixtures.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Expected {
    Call(Call),
    Parallel { calls: Vec<Call> },
    NoCall,
}

impl Expected {
    /// The expected calls, or `None` for an abstention task.
    pub fn calls(&self) -> Option<&[Call]> {
        match self {
            Expected::NoCall => None,
            Expected::Call(c) => Some(std::slice::from_ref(c)),
            Expected::Parallel { calls } => Some(calls),
        }
    }
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct ToolTask {
    pub id: String,
    pub category: String,
    pub prompt: String,
    pub tools: Vec<ToolSchema>,
    pub expected: Expected,
}

const FIXTURE: &str = include_str!("tasks.json");

/// The bundled, curated tool-call task set (single / parallel / select /
/// abstain). Embedded at compile time — indicative, prompt-based, not a
/// leaderboard.
pub fn tasks() -> Vec<ToolTask> {
    serde_json::from_str(FIXTURE).expect("bundled toolcall tasks.json is valid")
}

#[cfg(test)]
#[path = "tasks_tests.rs"]
mod tests;
