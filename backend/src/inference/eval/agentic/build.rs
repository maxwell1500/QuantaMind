use crate::errors::{AppError, AppResult};
use crate::inference::eval::agentic::runner::AgenticConfig;
use crate::inference::eval::agentic::sandbox::{DeterministicSandbox, EndStateRule};
use crate::inference::eval::toolcall::tasks::ToolTask;

/// Project an agentic `ToolTask` into a ready-to-run sandbox + config. Defense in
/// depth beyond `validate_tasks`: confirms the task is agentic and that every
/// checkpoint / mock names a declared tool. The task's `prompt` becomes the
/// initial prompt; `k`/`max_steps` fall back to `AgenticConfig::default()` (5/10).
pub fn sandbox_for(task: &ToolTask) -> AppResult<(DeterministicSandbox, AgenticConfig)> {
    let spec = task
        .agentic
        .as_ref()
        .ok_or_else(|| AppError::InvalidTaskSchema(format!("task '{}' is not agentic", task.id)))?;
    let known = |name: &str| task.tools.iter().any(|t| t.name == name);
    if let EndStateRule::RequireSequence(cps) = &spec.end_state {
        for cp in cps {
            if !known(&cp.tool) {
                return Err(AppError::InvalidTaskSchema(format!(
                    "task '{}' end-state checkpoint calls unknown tool '{}'",
                    task.id, cp.tool
                )));
            }
        }
    }
    for m in &spec.mocks {
        if !known(&m.call.name) {
            return Err(AppError::InvalidTaskSchema(format!(
                "task '{}' mock references unknown tool '{}'",
                task.id, m.call.name
            )));
        }
    }
    for f in &spec.faults {
        if !known(&f.call.name) {
            return Err(AppError::InvalidTaskSchema(format!(
                "task '{}' fault references unknown tool '{}'",
                task.id, f.call.name
            )));
        }
    }
    let sandbox = DeterministicSandbox::new(
        task.prompt.clone(),
        task.tools.clone(),
        spec.mocks.clone(),
        spec.end_state.clone(),
    )
    .with_faults(spec.faults.clone());
    let d = AgenticConfig::default();
    let cfg = AgenticConfig {
        k: spec.k.unwrap_or(d.k),
        max_steps: spec.max_steps.unwrap_or(d.max_steps),
        max_recovery: spec.max_recovery.unwrap_or(d.max_recovery),
    };
    Ok((sandbox, cfg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::sandbox::{MockResponse, TaskCheckpoint};
    use crate::inference::eval::agentic::spec::AgenticSpec;
    use crate::inference::eval::toolcall::tasks::{Call, ToolSchema};
    use serde_json::json;

    fn tool(name: &str) -> ToolSchema {
        ToolSchema {
            name: name.into(),
            description: "d".into(),
            parameters: json!({ "type": "object", "properties": {} }),
        }
    }

    fn agentic_task() -> ToolTask {
        ToolTask {
            id: "fin".into(),
            category: "agentic".into(),
            prompt: "Transfer the balance.".into(),
            tools: vec![tool("get_balance"), tool("transfer")],
            expected: Default::default(),
            agentic: Some(AgenticSpec {
                mocks: vec![MockResponse {
                    call: Call { name: "get_balance".into(), args: json!({ "id": "A" }) },
                    response: "{}".into(),
                }],
                end_state: EndStateRule::RequireSequence(vec![TaskCheckpoint {
                    tool: "transfer".into(),
                    args: json!({ "amount": 1.0 }),
                }]),
                tier: Default::default(),
                axes: None,
                k: None,
                max_steps: Some(7),
                faults: vec![],
                max_recovery: None,
            }),
        }
    }

    #[test]
    fn builds_sandbox_and_applies_config_defaults() {
        let (sandbox, cfg) = sandbox_for(&agentic_task()).unwrap();
        assert_eq!(sandbox.initial_prompt, "Transfer the balance.");
        assert!(sandbox.respond(&Call { name: "get_balance".into(), args: json!({ "id": "A" }) }).is_some());
        assert_eq!(cfg.k, 5); // default
        assert_eq!(cfg.max_steps, 7); // override
    }

    #[test]
    fn rejects_a_non_agentic_task() {
        let mut t = agentic_task();
        t.agentic = None;
        assert!(sandbox_for(&t).is_err());
    }
}
