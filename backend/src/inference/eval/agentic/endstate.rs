use crate::inference::eval::agentic::sandbox::EndStateRule;
use crate::inference::eval::toolcall::score::args_match;
use crate::inference::eval::toolcall::tasks::Call;

/// Does this parsed call satisfy the anti-cheat end-state? Same tool name AND the
/// exact structural args the rule demands — reusing the tool-call scorer's
/// arg-equality so the agentic success bar is identical to Phase 5's. A run that
/// never produces a call passing this is never a success.
pub fn satisfied(rule: &EndStateRule, call: &Call) -> bool {
    call.name == rule.tool && args_match(&rule.args, &call.args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rule() -> EndStateRule {
        EndStateRule { tool: "execute_transfer".into(), args: json!({ "amount": 450.0 }) }
    }

    #[test]
    fn matches_exact_tool_and_args() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "amount": 450.0 }) };
        assert!(satisfied(&rule(), &call));
    }

    #[test]
    fn rejects_wrong_tool() {
        let call = Call { name: "get_balance".into(), args: json!({ "amount": 450.0 }) };
        assert!(!satisfied(&rule(), &call));
    }

    #[test]
    fn rejects_wrong_args() {
        let call = Call { name: "execute_transfer".into(), args: json!({ "amount": 9.99 }) };
        assert!(!satisfied(&rule(), &call));
    }
}
