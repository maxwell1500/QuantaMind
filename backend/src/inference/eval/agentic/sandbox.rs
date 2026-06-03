use crate::inference::eval::toolcall::tasks::{Call, ToolSchema};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

/// One mocked tool result: the call the agent might make, and the deterministic
/// string the sandbox hands back for it. The Builder pane sends these as
/// structured pairs (not raw map keys) so the frontend never has to know our
/// canonical-key format.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct MockResponse {
    pub call: Call,
    pub response: String,
}

/// The exact tool call that MUST be intercepted for the task to count as a
/// success — the anti-cheat criterion. A run that yields without ever producing a
/// call matching this rule is a hallucinated completion, never a pass.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct EndStateRule {
    pub tool: String,
    pub args: Value,
}

/// A strictly prompt-based simulated environment: the opening user prompt, the
/// tool schemas injected into the system prompt, the deterministic mock results,
/// and the end-state success criterion. No native function-calling — the agent
/// emits raw-text JSON calls and the sandbox replies in text, so the identical
/// environment runs across Ollama / llama.cpp / MLX.
#[derive(Clone, Debug)]
pub struct DeterministicSandbox {
    pub initial_prompt: String,
    pub tools: Vec<ToolSchema>,
    /// `canonical(call)` -> deterministic tool result. Keyed by canonical form so
    /// a model that reorders its arg keys still hits the right mock.
    pub mock_responses: HashMap<String, String>,
    pub end_state: EndStateRule,
}

impl DeterministicSandbox {
    pub fn new(
        initial_prompt: String,
        tools: Vec<ToolSchema>,
        mocks: Vec<MockResponse>,
        end_state: EndStateRule,
    ) -> Self {
        let mock_responses = mocks.into_iter().map(|m| (canonical(&m.call), m.response)).collect();
        Self { initial_prompt, tools, mock_responses, end_state }
    }

    /// The deterministic result for a parsed call, or `None` when the agent called
    /// something the sandbox has no mock for (an unknown/hallucinated tool, or the
    /// right tool with wrong args). Matching goes through `canonical`, so arg key
    /// ordering is irrelevant.
    pub fn respond(&self, call: &Call) -> Option<&str> {
        self.mock_responses.get(&canonical(call)).map(String::as_str)
    }
}

/// A stable string key for a call: tool name + its args with object keys sorted
/// recursively. `{"a":1,"b":2}` and `{"b":2,"a":1}` produce the same key, so a
/// model's arbitrary key ordering never causes a mock miss.
pub fn canonical(call: &Call) -> String {
    format!("{}|{}", call.name, canonical_json(&call.args))
}

fn canonical_json(v: &Value) -> String {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let inner: Vec<String> = keys
                .into_iter()
                .map(|k| {
                    format!("{}:{}", serde_json::to_string(k).unwrap_or_default(), canonical_json(&map[k]))
                })
                .collect();
            format!("{{{}}}", inner.join(","))
        }
        Value::Array(arr) => format!("[{}]", arr.iter().map(canonical_json).collect::<Vec<_>>().join(",")),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn call(name: &str, args: Value) -> Call {
        Call { name: name.into(), args }
    }

    fn sandbox() -> DeterministicSandbox {
        DeterministicSandbox::new(
            "Transfer the balance.".into(),
            vec![],
            vec![MockResponse {
                call: call("get_balance", json!({ "account_id": "ACC-123" })),
                response: r#"{"status":200,"balance":450.0}"#.into(),
            }],
            EndStateRule { tool: "execute_transfer".into(), args: json!({ "amount": 450.0 }) },
        )
    }

    #[test]
    fn respond_returns_mock_for_known_call() {
        let sb = sandbox();
        let got = sb.respond(&call("get_balance", json!({ "account_id": "ACC-123" })));
        assert_eq!(got, Some(r#"{"status":200,"balance":450.0}"#));
    }

    #[test]
    fn respond_is_none_for_unknown_tool_or_wrong_args() {
        let sb = sandbox();
        // Unknown / hallucinated tool.
        assert_eq!(sb.respond(&call("search_web", json!({ "q": "rates" }))), None);
        // Right tool, wrong args → still a miss (the sandbox is deterministic).
        assert_eq!(sb.respond(&call("get_balance", json!({ "account_id": "ACC-999" }))), None);
    }

    #[test]
    fn canonical_is_arg_order_insensitive() {
        let a = call("t", json!({ "a": 1, "b": 2 }));
        let b = call("t", json!({ "b": 2, "a": 1 }));
        assert_eq!(canonical(&a), canonical(&b));
    }

    #[test]
    fn respond_matches_despite_reordered_args() {
        let sb = DeterministicSandbox::new(
            "p".into(),
            vec![],
            vec![MockResponse { call: call("f", json!({ "x": 1, "y": 2 })), response: "ok".into() }],
            EndStateRule { tool: "done".into(), args: json!({}) },
        );
        assert_eq!(sb.respond(&call("f", json!({ "y": 2, "x": 1 }))), Some("ok"));
    }
}
