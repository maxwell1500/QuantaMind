use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// A tool the model may call: name, a one-line description, and a JSON-Schema
/// `parameters` object (`{ "type": "object", "properties": {…}, "required": […] }`)
/// — the shape developers paste from their real tool definitions.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolSchema {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// A concrete tool call: a tool name + its argument object.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Call {
    pub name: String,
    pub args: Value,
}

/// What a correct model should do. `no_call` = the prompt needs no tool
/// (abstention). Internally tagged for readable fixtures.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolTask {
    pub id: String,
    pub category: String,
    pub prompt: String,
    pub tools: Vec<ToolSchema>,
    pub expected: Expected,
}

const CATEGORIES: [&str; 4] = ["single", "parallel", "select", "abstain"];

/// A tool's `parameters` must be a JSON-Schema object: `type:"object"`, a
/// `properties` map, and an optional `required` list. Used only to validate
/// the untyped `Value` — let serde do the structural work, not hand traversal.
#[derive(Deserialize)]
struct StrictParameters {
    #[serde(rename = "type")]
    schema_type: String,
    properties: BTreeMap<String, Value>,
    #[serde(default)]
    required: Option<Vec<String>>,
}

fn bad(id: &str, field: &str, why: &str) -> AppError {
    AppError::InvalidTaskSchema(format!("task '{id}' {field}: {why}"))
}

fn validate_tool(id: &str, tool: &ToolSchema) -> AppResult<()> {
    if tool.name.trim().is_empty() {
        return Err(bad(id, "tools", "a tool has an empty name"));
    }
    let p: StrictParameters = serde_json::from_value(tool.parameters.clone())
        .map_err(|e| bad(id, &format!("tool '{}' parameters", tool.name), &e.to_string()))?;
    if p.schema_type != "object" {
        return Err(bad(id, &format!("tool '{}' parameters", tool.name), "type must be \"object\""));
    }
    for r in p.required.iter().flatten() {
        if !p.properties.contains_key(r) {
            return Err(bad(id, &format!("tool '{}' parameters", tool.name), &format!("required '{r}' is not a declared property")));
        }
    }
    Ok(())
}

/// Validate a task collection from ANY source (built-in, saved, imported,
/// hand-edited) — the single backend-side trust boundary. Rejects empty sets,
/// empty tools, unknown categories, a malformed `parameters` schema, and an
/// `expected` shape that disagrees with the category.
pub fn validate_tasks(tasks: &[ToolTask]) -> AppResult<()> {
    if tasks.is_empty() {
        return Err(AppError::InvalidTaskSchema("a collection needs at least one task".into()));
    }
    for t in tasks {
        if t.id.trim().is_empty() {
            return Err(AppError::InvalidTaskSchema("a task has an empty id".into()));
        }
        if !CATEGORIES.contains(&t.category.as_str()) {
            return Err(bad(&t.id, "category", &format!("unknown '{}'", t.category)));
        }
        if t.tools.is_empty() {
            return Err(bad(&t.id, "tools", "must offer at least one tool"));
        }
        for tool in &t.tools {
            validate_tool(&t.id, tool)?;
        }
        let abstain = t.category == "abstain";
        if abstain != matches!(t.expected, Expected::NoCall) {
            return Err(bad(&t.id, "expected", "abstain ⇔ no_call (category and expected disagree)"));
        }
        if let Some(calls) = t.expected.calls() {
            for c in calls {
                if !t.tools.iter().any(|tool| tool.name == c.name) {
                    return Err(bad(&t.id, "expected", &format!("calls unknown tool '{}'", c.name)));
                }
            }
        }
    }
    Ok(())
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
