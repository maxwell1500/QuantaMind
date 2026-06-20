use crate::errors::{AppError, AppResult};
use crate::inference::eval::agentic::difficulty::passk::pass_k_for;
use crate::inference::eval::agentic::spec::{DifficultyAxes, Tier};
use crate::inference::eval::agentic::v2::transpile::{transpile_task, V2Task};
use crate::inference::eval::toolcall::tasks::{validate_tasks, ToolTask};
use serde::Deserialize;

/// A v2 collection as authored: one JSON object, NOT an array of tasks. The
/// per-task `category`/`tier`/`pass_k` flow from here. `region_variance` on `axes`
/// (a generation-only knob) is ignored — serde drops unknown fields.
#[derive(Deserialize)]
struct V2Collection {
    #[serde(default)]
    name: String,
    #[serde(default)]
    domain: String,
    tier: String,
    #[serde(default)]
    pass_k: Option<u32>,
    #[serde(default)]
    generated: bool,
    #[serde(default)]
    axes: DifficultyAxes,
    tasks: Vec<V2Task>,
}

/// Parse + transpile a v2 collection JSON into engine `ToolTask`s, then run the
/// `validate_tasks` trust boundary. The single entry point for bundled and (future)
/// user-imported v2 collections.
pub fn load_v2_collection(json: &str) -> AppResult<Vec<ToolTask>> {
    let c: V2Collection =
        serde_json::from_str(json).map_err(|e| AppError::InvalidTaskSchema(format!("v2 collection parse error: {e}")))?;
    let tier = parse_tier(&c.tier)?;
    let pass_k = c.pass_k.unwrap_or_else(|| pass_k_for(tier));
    let tasks = c
        .tasks
        .into_iter()
        .map(|t| transpile_task(t, tier, pass_k, c.axes.clone(), c.generated))
        .collect::<AppResult<Vec<_>>>()?;
    if tasks.is_empty() {
        return Err(AppError::InvalidTaskSchema(format!("v2 collection '{}' ({}) has no tasks", c.name, c.domain)));
    }
    validate_tasks(&tasks)?;
    Ok(tasks)
}

/// The authored tier label is capitalized (`"Easy"`/`"Hard"`); accept any case.
fn parse_tier(s: &str) -> AppResult<Tier> {
    match s.to_lowercase().as_str() {
        "easy" => Ok(Tier::Easy),
        "medium" => Ok(Tier::Medium),
        "hard" => Ok(Tier::Hard),
        "extreme" => Ok(Tier::Extreme),
        other => Err(AppError::InvalidTaskSchema(format!("unknown tier '{other}'"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::build::sandbox_for;
    use crate::inference::eval::agentic::sandbox::EndStateRule;

    const SAMPLE: &str = r#"{
      "name": "easy_coding", "domain": "coding", "tier": "Easy", "pass_k": 5,
      "axes": { "min_required_steps": 2, "decoy_tools": 1, "hidden_prereqs": 0,
                "conflicting_constraints": 1, "adversarial_context": false, "region_variance": false },
      "tasks": [{
        "id": "es_co_run", "category": "agent_loop", "max_steps": 7, "max_recovery": 2,
        "prompt": "Run the cart tests and report the failure. Do not edit source.",
        "world_state": { "cart": { "result": "fail", "failing": "test_tax" } },
        "tools": [
          { "name": "run_tests", "params": { "module": "string" } },
          { "name": "reply", "params": { "text": "string" } }
        ],
        "decoy_tools": [ { "name": "write_file", "params": { "path": "string" } } ],
        "expected_calls": [
          { "type": "call", "name": "run_tests", "args": { "module": "cart" } },
          { "type": "call", "name": "reply", "args": { "text": "*test_tax*" } }
        ],
        "must_not_call": [ "write_file" ],
        "faults": [ { "on_call": "run_tests", "type": "transient", "status_code": 503, "clears_after": 1 } ]
      }]
    }"#;

    #[test]
    fn loads_and_transpiles_a_v2_collection() {
        let tasks = load_v2_collection(SAMPLE).unwrap();
        assert_eq!(tasks.len(), 1);
        let t = &tasks[0];
        assert_eq!(t.category, "agent_loop");
        let spec = t.agentic.as_ref().unwrap();
        assert_eq!(spec.tier, Tier::Easy);
        assert!(matches!(spec.end_state, EndStateRule::RequireAll(ref c) if c.len() == 2));
        assert_eq!(spec.must_not_call.len(), 1);
        assert_eq!(spec.name_faults.len(), 1);
        assert!(spec.world_state.is_some());
        // Authored decoy is in the presented tools; no random-pool injection for v2.
        let (sandbox, cfg) = sandbox_for(t).unwrap();
        assert_eq!(sandbox.tools.len(), 3); // run_tests + reply + write_file decoy
        assert_eq!(cfg.k, 5); // authored pass_k
    }

    #[test]
    fn rejects_parallel_expected_call() {
        let bad = SAMPLE.replace(r#"{ "type": "call", "name": "run_tests", "args": { "module": "cart" } }"#, r#"{ "type": "parallel", "calls": [] }"#);
        assert!(load_v2_collection(&bad).is_err());
    }

    #[test]
    fn rejects_unknown_tier() {
        let bad = SAMPLE.replace(r#""tier": "Easy""#, r#""tier": "Legendary""#);
        assert!(load_v2_collection(&bad).is_err());
    }
}
