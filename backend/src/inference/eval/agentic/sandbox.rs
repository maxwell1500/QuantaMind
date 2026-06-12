use crate::inference::eval::agentic::spec::{FaultInjection, FaultRule};
use crate::inference::eval::toolcall::tasks::{Call, ToolSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// One mocked tool result: the call the agent might make, and the deterministic
/// string the sandbox hands back for it. The Builder pane sends these as
/// structured pairs (not raw map keys) so the frontend never has to know our
/// canonical-key format.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MockResponse {
    pub call: Call,
    pub response: String,
}

/// One required step in an agentic task's success sequence: a tool name + the
/// exact args that step must be called with.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TaskCheckpoint {
    pub tool: String,
    pub args: Value,
}

/// The success criterion (anti-cheat). `RequireSequence` demands the model call
/// each checkpoint in order before it may finish — a run that yields early is a
/// hallucinated/lazy failure. `ExpectAbstainingText` is the inverse: the correct
/// behavior is to make NO tool call and answer in plain text, so a robust planner
/// that correctly declines an unsafe/unnecessary action isn't scored as lazy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EndStateRule {
    RequireSequence(Vec<TaskCheckpoint>),
    ExpectAbstainingText,
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
    /// Driver-B lazy-agent traps: `canonical(call)` -> the fault that call trips.
    /// Empty for a fault-free sandbox. The mocks are immutable; the per-RUN attempt
    /// counters live in `SandboxState`, never here.
    pub faults: HashMap<String, FaultInjection>,
}

impl DeterministicSandbox {
    pub fn new(
        initial_prompt: String,
        tools: Vec<ToolSchema>,
        mocks: Vec<MockResponse>,
        end_state: EndStateRule,
    ) -> Self {
        let mock_responses = mocks.into_iter().map(|m| (canonical(&m.call), m.response)).collect();
        Self { initial_prompt, tools, mock_responses, end_state, faults: HashMap::new() }
    }

    /// Attach Driver-B fault traps (builder form, so the `new` signature and every
    /// existing caller/test stay unchanged). Keyed by `canonical(call)`.
    pub fn with_faults(mut self, faults: Vec<FaultRule>) -> Self {
        self.faults = faults.into_iter().map(|f| (canonical(&f.call), f.fault)).collect();
        self
    }

    /// The deterministic result for a parsed call, or `None` when the agent called
    /// something the sandbox has no mock for (an unknown/hallucinated tool, or the
    /// right tool with wrong args). Matching goes through `canonical`, so arg key
    /// ordering is irrelevant.
    pub fn respond(&self, call: &Call) -> Option<&str> {
        self.mock_responses.get(&canonical(call)).map(String::as_str)
    }
}

/// Per-RUN mutable fault state: how many times each trapped call has been
/// attempted so far. Lives outside `DeterministicSandbox` (which is immutable and
/// shared across the Pass^k runs) so each run starts with a clean slate — a
/// transient trap that cleared in run 1 traps again in run 2.
#[derive(Default)]
pub struct SandboxState {
    attempts: HashMap<String, u8>,
}

impl SandboxState {
    pub fn new() -> Self {
        Self::default()
    }

    /// The error text to inject for `call` on THIS attempt, or `None` when the call
    /// is untrapped or its transient fault has already cleared (so the real mock
    /// result should flow). Persistent faults always return text; transient faults
    /// return text for the first `clears_after` attempts, then clear. Counters are
    /// per-call (`canonical`), so multi-tool tasks trap independently.
    pub fn fault_for(
        &mut self,
        call: &Call,
        faults: &HashMap<String, FaultInjection>,
    ) -> Option<String> {
        let key = canonical(call);
        match faults.get(&key)? {
            FaultInjection::PersistentError { status_code } => {
                Some(format!("HTTP {status_code} Fatal"))
            }
            FaultInjection::TransientError { status_code, clears_after } => {
                let n = self.attempts.entry(key).or_insert(0);
                if *n < *clears_after {
                    *n += 1;
                    Some(format!("HTTP {status_code} Service Unavailable"))
                } else {
                    None // cleared — let the deterministic mock result through
                }
            }
        }
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
            EndStateRule::RequireSequence(vec![TaskCheckpoint {
                tool: "execute_transfer".into(),
                args: json!({ "amount": 450.0 }),
            }]),
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
            EndStateRule::RequireSequence(vec![TaskCheckpoint { tool: "done".into(), args: json!({}) }]),
        );
        assert_eq!(sb.respond(&call("f", json!({ "y": 2, "x": 1 }))), Some("ok"));
    }

    fn faults(rules: Vec<FaultRule>) -> HashMap<String, FaultInjection> {
        rules.into_iter().map(|r| (canonical(&r.call), r.fault)).collect()
    }

    #[test]
    fn transient_fault_clears_after_n_attempts() {
        let c = call("fetch", json!({ "id": 1 }));
        let f = faults(vec![FaultRule {
            call: c.clone(),
            fault: FaultInjection::TransientError { status_code: 503, clears_after: 2 },
        }]);
        let mut state = SandboxState::new();
        assert_eq!(state.fault_for(&c, &f), Some("HTTP 503 Service Unavailable".into())); // 1
        assert_eq!(state.fault_for(&c, &f), Some("HTTP 503 Service Unavailable".into())); // 2
        assert_eq!(state.fault_for(&c, &f), None); // cleared on the 3rd attempt
        assert_eq!(state.fault_for(&c, &f), None); // stays cleared
    }

    #[test]
    fn persistent_fault_never_clears() {
        let c = call("charge", json!({ "amt": 10 }));
        let f = faults(vec![FaultRule {
            call: c.clone(),
            fault: FaultInjection::PersistentError { status_code: 500 },
        }]);
        let mut state = SandboxState::new();
        for _ in 0..5 {
            assert_eq!(state.fault_for(&c, &f), Some("HTTP 500 Fatal".into()));
        }
    }

    #[test]
    fn fault_counters_are_per_call_independent() {
        let a = call("a", json!({}));
        let b = call("b", json!({}));
        let f = faults(vec![
            FaultRule { call: a.clone(), fault: FaultInjection::TransientError { status_code: 503, clears_after: 1 } },
            FaultRule { call: b.clone(), fault: FaultInjection::TransientError { status_code: 429, clears_after: 1 } },
        ]);
        let mut state = SandboxState::new();
        assert!(state.fault_for(&a, &f).is_some()); // a: attempt 1 → fails
        assert!(state.fault_for(&b, &f).is_some()); // b: attempt 1 → fails (independent of a)
        assert!(state.fault_for(&a, &f).is_none()); // a: cleared
        assert!(state.fault_for(&b, &f).is_none()); // b: cleared
    }

    #[test]
    fn untrapped_call_never_faults() {
        let f = faults(vec![FaultRule {
            call: call("trapped", json!({})),
            fault: FaultInjection::PersistentError { status_code: 500 },
        }]);
        let mut state = SandboxState::new();
        assert_eq!(state.fault_for(&call("safe", json!({})), &f), None);
    }

    #[test]
    fn with_faults_keys_by_canonical_form() {
        let sb = sandbox().with_faults(vec![FaultRule {
            call: call("get_balance", json!({ "account_id": "ACC-123" })),
            fault: FaultInjection::PersistentError { status_code: 500 },
        }]);
        // Reordered args still resolve to the same fault key.
        assert!(sb.faults.contains_key(&canonical(&call("get_balance", json!({ "account_id": "ACC-123" })))));
    }
}
