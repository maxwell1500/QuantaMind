use crate::inference::eval::agentic::sandbox::TaskCheckpoint;
use crate::inference::eval::toolcall::score::args_match;
use crate::inference::eval::toolcall::tasks::{Call, ToolSchema};
use serde_json::Value;

/// Does this parsed call satisfy a single required checkpoint? Same tool name AND
/// the exact structural args the checkpoint demands — reusing the tool-call
/// scorer's arg-equality so the agentic success bar is identical to Phase 5's.
/// The runner walks the checkpoint sequence in order, advancing one per match.
pub fn checkpoint_matches(checkpoint: &TaskCheckpoint, call: &Call) -> bool {
    call.name == checkpoint.tool && args_match(&checkpoint.args, &call.args)
}

/// Phase 9-v2 checkpoint match: same tool name AND wildcard-aware args
/// (`args_match_v2` — a `*…*` string arg globs; everything else stays exact). Used
/// only by the `RequireAll` end state; `RequireSequence` keeps the exact matcher.
pub fn checkpoint_matches_v2(checkpoint: &TaskCheckpoint, call: &Call) -> bool {
    use crate::inference::eval::agentic::v2::r#match::args_match_v2;
    call.name == checkpoint.tool && args_match_v2(&checkpoint.args, &call.args)
}

/// Driver D — SEMANTIC validation of a parsed call against the tool schema (not
/// just "did it parse"). `Ok(())` when the call names a declared tool, supplies
/// every `required` param, and the provided params match their declared primitive
/// type. Otherwise `Err(precise message)` (e.g. "key `account_id` required") that
/// the runner injects so the model gets an actionable correction to recover from.
/// Flat, depth-1 (top-level params only), matching the single-turn scorer.
pub fn validate_call(call: &Call, tools: &[ToolSchema]) -> Result<(), String> {
    let tool = tools
        .iter()
        .find(|t| t.name == call.name)
        .ok_or_else(|| format!("unknown tool `{}`", call.name))?;
    let args = call.args.as_object().ok_or("arguments must be a JSON object")?;
    let params = &tool.parameters;

    if let Some(required) = params.get("required").and_then(Value::as_array) {
        for key in required.iter().filter_map(Value::as_str) {
            if !args.contains_key(key) {
                return Err(format!("key `{key}` required"));
            }
        }
    }
    if let Some(props) = params.get("properties").and_then(Value::as_object) {
        for (key, val) in args {
            if let Some(expected) = props.get(key).and_then(|s| s.get("type")).and_then(Value::as_str) {
                if !type_ok(expected, val) {
                    return Err(format!("key `{key}` expects {expected}"));
                }
            }
        }
    }
    Ok(())
}

/// Whether a JSON value satisfies a JSON-Schema primitive `type`. Unknown/absent
/// types aren't enforced (lenient), so a schema without a `type` never blocks.
fn type_ok(expected: &str, v: &Value) -> bool {
    match expected {
        "string" => v.is_string(),
        "number" => v.is_number(),
        "integer" => v.is_i64() || v.is_u64(),
        "boolean" => v.is_boolean(),
        "object" => v.is_object(),
        "array" => v.is_array(),
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cp() -> TaskCheckpoint {
        TaskCheckpoint { tool: "execute_transfer".into(), args: json!({ "amount": 450.0 }) }
    }

    #[test]
    fn matches_exact_tool_and_args() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "amount": 450.0 }) };
        assert!(checkpoint_matches(&cp(), &call));
    }

    #[test]
    fn rejects_wrong_tool() {
        let call = Call { name: "get_balance".into(), args: json!({ "amount": 450.0 }) };
        assert!(!checkpoint_matches(&cp(), &call));
    }

    #[test]
    fn rejects_wrong_args() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "amount": 9.99 }) };
        assert!(!checkpoint_matches(&cp(), &call));
    }

    fn tools() -> Vec<ToolSchema> {
        vec![ToolSchema {
            name: "execute_transfer".into(),
            description: "Move funds".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "account_id": { "type": "string" },
                    "amount": { "type": "number" }
                },
                "required": ["account_id", "amount"]
            }),
        }]
    }

    #[test]
    fn validate_accepts_a_well_formed_call() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "account_id": "A", "amount": 5.0 }) };
        assert_eq!(validate_call(&call, &tools()), Ok(()));
    }

    #[test]
    fn validate_rejects_unknown_tool() {
        let call = Call { name: "wire_money".into(), args: json!({}) };
        assert_eq!(validate_call(&call, &tools()), Err("unknown tool `wire_money`".into()));
    }

    #[test]
    fn validate_reports_the_missing_required_key() {
        // amount present, account_id missing → precise, actionable message.
        let call = Call { name: "execute_transfer".into(), args: json!({ "amount": 5.0 }) };
        assert_eq!(validate_call(&call, &tools()), Err("key `account_id` required".into()));
    }

    #[test]
    fn validate_rejects_a_wrong_type() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "account_id": "A", "amount": "lots" }) };
        assert_eq!(validate_call(&call, &tools()), Err("key `amount` expects number".into()));
    }

    #[test]
    fn validate_rejects_non_object_args() {
        let call = Call { name: "execute_transfer".into(), args: json!("oops") };
        assert!(validate_call(&call, &tools()).is_err());
    }
}
