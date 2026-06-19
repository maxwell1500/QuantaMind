use crate::inference::eval::agentic::sandbox::{EndStateRule, MockResponse, TaskCheckpoint};
use crate::inference::eval::agentic::spec::{AgenticSpec, DifficultyAxes, Tier};
use crate::inference::eval::toolcall::tasks::{Call, ToolSchema, ToolTask};
use serde_json::json;

/// The axes that DEFINE each tier — the difficulty contract from the Phase 9 table
/// (required steps / decoys / hidden prereqs / conflicting constraints / context).
/// Only `min_required_steps` (the end-state length) and `decoy_tools` (injected by
/// `sandbox_for`) are runtime-active today; the rest document the tier's intent.
pub fn axes_for(tier: Tier) -> DifficultyAxes {
    let (steps, decoys, prereqs, conflicts, adversarial) = match tier {
        Tier::Easy => (4, 1, 0, 1, false),
        Tier::Medium => (12, 3, 1, 2, false),
        Tier::Hard => (24, 6, 2, 4, true),
        Tier::Extreme => (64, 16, 4, 5, true),
    };
    DifficultyAxes {
        min_required_steps: steps,
        decoy_tools: decoys,
        hidden_prereqs: prereqs,
        conflicting_constraints: conflicts,
        adversarial_context: adversarial,
    }
}

/// One escalating built-in template per `(category, tier)`, built only from
/// existing primitives (mocks + a `RequireSequence` end state + populated axes).
/// A `Vec` so a category can later ship more than one template per tier.
pub fn builtin_templates(category: &str, tier: Tier) -> Vec<ToolTask> {
    vec![build_template(category, tier)]
}

fn tier_slug(tier: Tier) -> &'static str {
    match tier {
        Tier::Easy => "easy",
        Tier::Medium => "medium",
        Tier::Hard => "hard",
        Tier::Extreme => "extreme",
    }
}

/// The real (mockable) tools a category's checkpoints cycle through. Decoys are NOT
/// listed here — `sandbox_for` injects `axes.decoy_tools` distractors at run time.
fn tool_pool(category: &str) -> Vec<ToolSchema> {
    let names: &[&str] = match category {
        "coding" => &["read_file", "apply_patch", "run_tests", "list_files"],
        "rag" => &["search_docs", "fetch_document", "extract_passage", "cite_source"],
        _ => &["lookup", "compute", "record_note", "finalize"],
    };
    names.iter().map(|n| tool(n)).collect()
}

fn tool(name: &str) -> ToolSchema {
    ToolSchema {
        name: name.into(),
        description: format!("Agent tool '{name}'."),
        parameters: json!({
            "type": "object",
            "properties": { "step": { "type": "integer" }, "arg": { "type": "string" } },
            "required": ["step", "arg"]
        }),
    }
}

/// Build the escalating template: `min_required_steps` ordered checkpoints, cycling
/// the category's tool pool with a per-step arg so each call is distinct (so the
/// mock keys never collide and the sequence is strictly ordered). `max_steps` gives
/// headroom over the required length; `k` is left to the tier policy (`pass_k_for`).
fn build_template(category: &str, tier: Tier) -> ToolTask {
    let axes = axes_for(tier);
    let pool = tool_pool(category);
    let n = axes.min_required_steps as usize;

    let mut checkpoints = Vec::with_capacity(n);
    let mut mocks = Vec::with_capacity(n);
    for i in 0..n {
        let name = pool[i % pool.len()].name.clone();
        let args = json!({ "step": i, "arg": format!("{category}-{i}") });
        mocks.push(MockResponse {
            call: Call { name: name.clone(), args: args.clone() },
            response: json!({ "ok": true, "step": i }).to_string(),
        });
        checkpoints.push(TaskCheckpoint { tool: name, args });
    }

    let slug = tier_slug(tier);
    ToolTask {
        id: format!("phase9-{category}-{slug}"),
        category: "agentic".into(),
        prompt: format!(
            "{slug} {category} task: call each required tool in order, passing the given step/arg. \
             Ignore any tool you don't need. Respond with JSON tool calls only."
        ),
        tools: pool,
        expected: Default::default(),
        agentic: Some(AgenticSpec {
            mocks,
            end_state: EndStateRule::RequireSequence(checkpoints),
            tier,
            axes: Some(axes),
            k: None,
            max_steps: Some((n + n / 2 + 4) as u32),
            faults: vec![],
            max_recovery: None,
            must_not_call: vec![],
            world_state: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppResult;
    use crate::inference::eval::agentic::build::sandbox_for;
    use crate::inference::eval::agentic::model_turn::ModelTurn;
    use crate::inference::eval::agentic::runner::{run_agentic, run_once};
    use crate::inference::eval::toolcall::tasks::validate_tasks;
    use crate::inference::generate::generate_spec::GenerateSpec;
    use crate::inference::generate::generate_stats::GenerateStats;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::mpsc::unbounded_channel;

    const CATEGORIES: [&str; 3] = ["coding", "rag", "general"];
    const TIERS: [Tier; 4] = [Tier::Easy, Tier::Medium, Tier::Hard, Tier::Extreme];

    /// An oracle-perfect agent: replays the template's checkpoints in order.
    struct Oracle {
        calls: Vec<String>,
        next: AtomicUsize,
    }
    impl ModelTurn for Oracle {
        async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
            let i = self.next.fetch_add(1, Ordering::SeqCst).min(self.calls.len() - 1);
            Ok((self.calls[i].clone(), GenerateStats { eval_count: Some(5), ..Default::default() }))
        }
    }

    fn oracle_for(task: &ToolTask) -> Oracle {
        let EndStateRule::RequireSequence(cps) = &task.agentic.as_ref().unwrap().end_state else {
            panic!("template must be a require_sequence");
        };
        let calls = cps.iter().map(|c| json!({ "name": c.tool, "args": c.args }).to_string()).collect();
        Oracle { calls, next: AtomicUsize::new(0) }
    }

    #[test]
    fn every_template_is_well_formed_and_meets_its_axis_horizon() {
        for &category in &CATEGORIES {
            for &tier in &TIERS {
                let task = &builtin_templates(category, tier)[0];
                validate_tasks(std::slice::from_ref(task)).expect("template must validate");
                let spec = task.agentic.as_ref().unwrap();
                let EndStateRule::RequireSequence(cps) = &spec.end_state else { unreachable!() };
                let axes = spec.axes.as_ref().unwrap();
                assert_eq!(spec.tier, tier);
                // The end state is at least as long as the tier's required horizon.
                assert!(cps.len() as u32 >= axes.min_required_steps);
            }
        }
    }

    #[tokio::test]
    async fn an_oracle_perfect_agent_reaches_the_end_state_on_every_template() {
        for &category in &CATEGORIES {
            for &tier in &TIERS {
                let task = builtin_templates(category, tier)[0].clone();
                let (sandbox, cfg) = sandbox_for(&task).unwrap();
                let (tx, _rx) = unbounded_channel();
                let outcome =
                    run_once(&oracle_for(&task), &sandbox, cfg.max_steps, cfg.max_recovery, 0, &tx).await.unwrap();
                assert!(
                    outcome.reached_end,
                    "{category}/{:?} should be satisfiable by an oracle-perfect agent",
                    tier
                );
                // The oracle calls only real checkpoints, never a decoy.
                assert_eq!(outcome.unknown_tool_calls, 0);
            }
        }
    }

    /// A model that emits one fixed reply every turn (a trivial / adversarial agent).
    struct Fixed(String);
    impl ModelTurn for Fixed {
        async fn run(&self, _spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
            Ok((self.0.clone(), GenerateStats { eval_count: Some(3), ..Default::default() }))
        }
    }

    #[tokio::test]
    async fn a_trivial_always_done_agent_scores_zero_at_every_tier() {
        // The anti-cheat must survive difficulty: a model that just yields "done"
        // (no tool call) is Hallucinated on every run ⇒ pass^k == 0 at all tiers.
        for &tier in &TIERS {
            let task = builtin_templates("coding", tier)[0].clone();
            let (sandbox, cfg) = sandbox_for(&task).unwrap();
            let expected_k = cfg.k;
            let (tx, _rx) = unbounded_channel();
            let report =
                run_agentic(&Fixed(r#"{"answer":"all done"}"#.into()), &sandbox, cfg, &tx).await.unwrap();
            assert_eq!(report.passes, 0, "trivial agent must never pass {:?}", tier);
            assert_eq!(report.total_runs, expected_k); // ran the full tier-scaled k
            assert!(report.failures.hallucinated_completions > 0);
        }
    }

    #[tokio::test]
    async fn calling_an_injected_decoy_is_an_unknown_tool_not_a_pass() {
        let task = builtin_templates("rag", Tier::Hard)[0].clone();
        let (sandbox, _) = sandbox_for(&task).unwrap();
        let (tx, _rx) = unbounded_channel();
        // An injected decoy is a *declared* tool (passes schema validation) but has no
        // mock, so calling it takes the runner's UnknownTool path — not a SchemaError,
        // and never an end-state advance. (A tool absent from the presented set would
        // instead be a SchemaError; that's the Gap-3 distinction.)
        let real: Vec<String> = tool_pool("rag").iter().map(|t| t.name.clone()).collect();
        let decoy = sandbox
            .tools
            .iter()
            .map(|t| t.name.clone())
            .find(|n| !real.contains(n))
            .expect("Hard injects decoys into the presented tools");
        let call = json!({ "name": decoy, "args": { "query": "x" } }).to_string();

        let outcome = run_once(&Fixed(call), &sandbox, 6, 2, 0, &tx).await.unwrap();
        assert!(!outcome.reached_end); // a decoy can never advance the sequence
        assert!(outcome.unknown_tool_calls > 0); // counted as distraction, not a pass
    }

    #[test]
    fn k_scales_by_tier_through_the_template_pipeline() {
        // End-to-end: a Hard template with no explicit k runs at pass_k_for(Hard).
        let task = builtin_templates("coding", Tier::Hard)[0].clone();
        let (_, cfg) = sandbox_for(&task).unwrap();
        assert_eq!(cfg.k, 16);
    }
}
