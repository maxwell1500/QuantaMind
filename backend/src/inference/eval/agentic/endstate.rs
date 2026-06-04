use crate::inference::eval::agentic::sandbox::TaskCheckpoint;
use crate::inference::eval::toolcall::score::args_match;
use crate::inference::eval::toolcall::tasks::Call;

/// Does this parsed call satisfy a single required checkpoint? Same tool name AND
/// the exact structural args the checkpoint demands — reusing the tool-call
/// scorer's arg-equality so the agentic success bar is identical to Phase 5's.
/// The runner walks the checkpoint sequence in order, advancing one per match.
pub fn checkpoint_matches(checkpoint: &TaskCheckpoint, call: &Call) -> bool {
    call.name == checkpoint.tool && args_match(&checkpoint.args, &call.args)
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
}
