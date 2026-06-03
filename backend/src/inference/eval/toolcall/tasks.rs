use crate::errors::{AppError, AppResult};
use crate::inference::eval::agentic::sandbox::EndStateRule;
use crate::inference::eval::agentic::spec::AgenticSpec;
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
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Expected {
    Call(Call),
    Parallel { calls: Vec<Call> },
    #[default]
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
    /// The single-turn success criterion. Defaults to `NoCall` so an agentic task
    /// (which scores via its `agentic.end_state`) need not author one.
    #[serde(default)]
    pub expected: Expected,
    /// Present only for `category == "agentic"` tasks: sandbox mocks, the success
    /// criterion, and Pass^k/step-cap. `skip_serializing_if` keeps single-turn
    /// collections byte-for-byte unchanged on save.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agentic: Option<AgenticSpec>,
}

const CATEGORIES: [&str; 5] = ["single", "parallel", "select", "abstain", "agentic"];

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
        if t.category == "agentic" {
            // The agentic path scores via `agentic.end_state`, not `expected`, so
            // the single-turn abstain/expected rule below is skipped entirely.
            let spec = t
                .agentic
                .as_ref()
                .ok_or_else(|| bad(&t.id, "agentic", "an agentic task requires an agentic spec"))?;
            validate_agentic(&t.id, &t.tools, spec)?;
        } else {
            if t.agentic.is_some() {
                return Err(bad(&t.id, "agentic", "only agentic tasks may carry an agentic spec"));
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
    }
    Ok(())
}

/// Validate an agentic task's spec: every end-state checkpoint and mock must name
/// a declared tool, a `require_sequence` needs ≥1 checkpoint, and k/max_steps (if
/// set) must be ≥1. The single backend-side trust boundary for agentic tasks.
fn validate_agentic(id: &str, tools: &[ToolSchema], spec: &AgenticSpec) -> AppResult<()> {
    let known = |name: &str| tools.iter().any(|t| t.name == name);
    match &spec.end_state {
        EndStateRule::RequireSequence(cps) => {
            if cps.is_empty() {
                return Err(bad(id, "agentic", "end-state require_sequence needs at least one checkpoint"));
            }
            for cp in cps {
                if !known(&cp.tool) {
                    return Err(bad(id, "agentic", &format!("end-state checkpoint calls unknown tool '{}'", cp.tool)));
                }
            }
        }
        EndStateRule::ExpectAbstainingText => {}
    }
    for m in &spec.mocks {
        if !known(&m.call.name) {
            return Err(bad(id, "agentic", &format!("mock references unknown tool '{}'", m.call.name)));
        }
    }
    if matches!(spec.k, Some(0)) || matches!(spec.max_steps, Some(0)) {
        return Err(bad(id, "agentic", "k and max_steps must be >= 1"));
    }
    Ok(())
}

const FIXTURE: &str = include_str!("tasks.json");
const FINANCE_FIXTURE: &str = include_str!("tasks_finance.json");
const AGENTIC_FIXTURE: &str = include_str!("tasks_agentic.json");

/// The bundled, curated tool-call task set (single / parallel / select /
/// abstain). Embedded at compile time — indicative, prompt-based, not a
/// leaderboard.
pub fn tasks() -> Vec<ToolTask> {
    serde_json::from_str(FIXTURE).expect("bundled toolcall tasks.json is valid")
}

/// A finance-themed tool-call set (balances / sums / transaction search +
/// abstain). Structural tool-call reliability — NOT a PDF/data parser.
pub fn finance_tasks() -> Vec<ToolTask> {
    serde_json::from_str(FINANCE_FIXTURE).expect("bundled tasks_finance.json is valid")
}

/// A multi-step agentic preset (a required-sequence transfer + a correct
/// abstention). Exercises the sandbox loop, Pass^k, and the anti-cheat.
pub fn agentic_tasks() -> Vec<ToolTask> {
    serde_json::from_str(AGENTIC_FIXTURE).expect("bundled tasks_agentic.json is valid")
}

/// Read-only built-in presets: `(id, label)`. The runner is still handed a
/// `Vec<ToolTask>` — these just enumerate the bundled sets.
pub const BUILTIN_COLLECTIONS: &[(&str, &str)] =
    &[("curated", "Curated Suite"), ("finance", "Finance (preset)"), ("agentic", "Agentic (preset)")];

/// Tasks for a built-in preset id, or `None` if unknown.
pub fn builtin_collection(id: &str) -> Option<Vec<ToolTask>> {
    match id {
        "curated" => Some(tasks()),
        "finance" => Some(finance_tasks()),
        "agentic" => Some(agentic_tasks()),
        _ => None,
    }
}

#[cfg(test)]
#[path = "tasks_tests.rs"]
mod tests;
