use crate::errors::{AppError, AppResult};
use crate::inference::eval::agentic::difficulty::decoys;
use crate::inference::eval::agentic::difficulty::passk::pass_k_for;
use crate::inference::eval::agentic::runner::AgenticConfig;
use crate::inference::eval::agentic::sandbox::{DeterministicSandbox, EndStateRule};
use crate::inference::eval::toolcall::tasks::ToolTask;

/// FNV-1a over the task id: a stable, dependency-free seed so a task's decoy set is
/// reproducible across machines/runs yet differs per task. Decoys are fixed for the
/// whole Pass^k batch (one sandbox per task), so this is keyed on the task, not the
/// run index. The per-instance generator seed (Phase 9C) is a separate concern.
fn seed_from_id(id: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in id.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

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
    // Phase 9A: present the real tools with `axes.decoy_tools` distractors shuffled
    // in (deterministic per task). A decoy is never an expected checkpoint and has
    // no mock, so it can never satisfy the end state — the oracle is untouched.
    let decoy_n = spec.axes.as_ref().map(|a| a.decoy_tools).unwrap_or(0);
    let presented = decoys::merge_decoys(&task.tools, decoy_n, seed_from_id(&task.id));
    let sandbox = DeterministicSandbox::new(
        task.prompt.clone(),
        presented,
        spec.mocks.clone(),
        spec.end_state.clone(),
    )
    .with_faults(spec.faults.clone());
    let d = AgenticConfig::default();
    let cfg = AgenticConfig {
        // Precedence (Gap 4): an explicit `k` (authored, or the UI K override that
        // `apply_overrides` writes into `spec.k`) wins; otherwise scale by tier.
        k: spec.k.unwrap_or_else(|| pass_k_for(spec.tier)),
        max_steps: spec.max_steps.unwrap_or(d.max_steps),
        max_recovery: spec.max_recovery.unwrap_or(d.max_recovery),
    };
    Ok((sandbox, cfg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::sandbox::{MockResponse, TaskCheckpoint};
    use crate::inference::eval::agentic::spec::{AgenticSpec, DifficultyAxes, Tier};
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
                must_not_call: vec![],
                world_state: None,
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
    fn decoy_axis_injects_distractors_that_cannot_satisfy_the_end_state() {
        let mut t = agentic_task();
        t.id = "decoy-task".into();
        t.agentic.as_mut().unwrap().axes =
            Some(DifficultyAxes { decoy_tools: 4, ..Default::default() });
        let (sandbox, _) = sandbox_for(&t).unwrap();

        // The real (mockable) tools survive...
        assert!(sandbox.tools.iter().any(|x| x.name == "get_balance"));
        assert!(sandbox.tools.iter().any(|x| x.name == "transfer"));
        // ...plus exactly 4 decoys.
        assert_eq!(sandbox.tools.len(), 2 + 4);
        // A decoy is schema-valid but has no mock, so respond() is None — calling it
        // yields the runner's "unknown tool" injection, never an end-state advance.
        let decoy =
            sandbox.tools.iter().find(|x| x.name != "get_balance" && x.name != "transfer").unwrap();
        assert!(sandbox.respond(&Call { name: decoy.name.clone(), args: json!({}) }).is_none());
    }

    #[test]
    fn tier_scales_k_when_no_explicit_k_is_authored() {
        let mut t = agentic_task();
        t.agentic.as_mut().unwrap().k = None; // no explicit k → tier policy decides
        t.agentic.as_mut().unwrap().tier = Tier::Hard;
        let (_, cfg) = sandbox_for(&t).unwrap();
        assert_eq!(cfg.k, 16); // pass_k_for(Hard)
    }

    #[test]
    fn an_explicit_k_wins_over_the_tier_policy() {
        let mut t = agentic_task();
        t.agentic.as_mut().unwrap().k = Some(3); // authored / UI override
        t.agentic.as_mut().unwrap().tier = Tier::Extreme; // would be 24
        let (_, cfg) = sandbox_for(&t).unwrap();
        assert_eq!(cfg.k, 3); // explicit k beats pass_k_for(Extreme)
    }

    #[test]
    fn the_decoy_set_is_deterministic_for_a_given_task() {
        let mut t = agentic_task();
        t.id = "stable-id".into();
        t.agentic.as_mut().unwrap().axes =
            Some(DifficultyAxes { decoy_tools: 5, ..Default::default() });
        let names = |t: &ToolTask| -> Vec<String> {
            sandbox_for(t).unwrap().0.tools.iter().map(|x| x.name.clone()).collect()
        };
        assert_eq!(names(&t), names(&t)); // same task → identical presented order
    }

    #[test]
    fn rejects_a_non_agentic_task() {
        let mut t = agentic_task();
        t.agentic = None;
        assert!(sandbox_for(&t).is_err());
    }
}
