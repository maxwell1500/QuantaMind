use serde::Deserialize;

/// Every bundled v2 tiered scenario collection: `(id, raw JSON)`. The id is the
/// file stem; the collection's domain + tier come from the JSON header. These are
/// THE eval content — they replace the old hand-coded single/multi fixtures.
pub const V2_SCENARIOS: &[(&str, &str)] = &[
    ("easy-coding", include_str!("scenarios/easy-coding.json")),
    ("easy-customer-support", include_str!("scenarios/easy-customer-support.json")),
    ("easy-ecommerce", include_str!("scenarios/easy-ecommerce.json")),
    ("easy-finance", include_str!("scenarios/easy-finance.json")),
    ("easy-math-science", include_str!("scenarios/easy-math-science.json")),
    ("medium-coding", include_str!("scenarios/medium-coding.json")),
    ("medium-customer-support", include_str!("scenarios/medium-customer-support.json")),
    ("medium-ecommerce", include_str!("scenarios/medium-ecommerce.json")),
    ("medium-finance", include_str!("scenarios/medium-finance.json")),
    ("medium-legal", include_str!("scenarios/medium-legal.json")),
    ("medium-medical", include_str!("scenarios/medium-medical.json")),
    ("hard-coding", include_str!("scenarios/hard-coding.json")),
    ("hard-finance", include_str!("scenarios/hard-finance.json")),
    ("hard-finance-2", include_str!("scenarios/hard-finance-2.json")),
    ("hard-medical", include_str!("scenarios/hard-medical.json")),
    ("hard-support-ecommerce", include_str!("scenarios/hard-support-ecommerce.json")),
    ("extreme-clinical-trial-stats", include_str!("scenarios/extreme-clinical-trial-stats.json")),
    ("extreme-legal-compliance", include_str!("scenarios/extreme-legal-compliance.json")),
    ("extreme-supply-chain-recon", include_str!("scenarios/extreme-supply-chain-recon.json")),
];

/// Raw JSON for a bundled v2 collection by id.
pub fn v2_json(id: &str) -> Option<&'static str> {
    V2_SCENARIOS.iter().find(|(i, _)| *i == id).map(|(_, j)| *j)
}

/// Lightweight collection header for the picker (domain + tier), without
/// transpiling every task.
#[derive(Deserialize)]
pub struct V2Header {
    #[serde(default)]
    pub domain: String,
    #[serde(default)]
    pub tier: String,
}

pub fn v2_header(json: &str) -> Option<V2Header> {
    serde_json::from_str(json).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::sandbox::{EndStateRule, TaskCheckpoint};
    use crate::inference::eval::agentic::v2::collection::load_v2_collection;
    use crate::inference::eval::agentic::v2::r#match::args_match_v2;
    use serde_json::Value;
    use std::collections::HashSet;

    fn has_wildcard(args: &Value) -> bool {
        args.as_object()
            .map(|o| o.values().any(|v| v.as_str().is_some_and(|s| s.contains('*'))))
            .unwrap_or(false)
    }

    /// `a` is a strict wildcard-superset of `b`: same tool, `a` has a wildcard, `a`'s
    /// pattern matches `b`'s args, but not the reverse — so greedy-first RequireAll
    /// matching could consume `a` with a call meant for the narrower `b` (false-negative).
    fn wildcard_superset(a: &TaskCheckpoint, b: &TaskCheckpoint) -> bool {
        a.tool == b.tool
            && has_wildcard(&a.args)
            && args_match_v2(&a.args, &b.args)
            && !args_match_v2(&b.args, &a.args)
    }

    /// Permanent answer-key guard: a future authored scenario can't silently regress
    /// these without failing the build.
    #[test]
    fn bundled_collections_pass_deep_integrity_checks() {
        for (id, json) in V2_SCENARIOS {
            for t in load_v2_collection(json).unwrap() {
                let spec = t.agentic.as_ref().unwrap();
                let tools: HashSet<&str> = t.tools.iter().map(|x| x.name.as_str()).collect();
                // name-keyed faults must name a presented tool (a typo'd on_call never fires).
                for nf in &spec.name_faults {
                    assert!(tools.contains(nf.on_call.as_str()), "{id}/{}: fault on_call '{}' not a tool", t.id, nf.on_call);
                }
                // no wildcard-superset shadowing among RequireAll checkpoints.
                if let EndStateRule::RequireAll(cps) = &spec.end_state {
                    for (i, a) in cps.iter().enumerate() {
                        for (j, b) in cps.iter().enumerate() {
                            assert!(i == j || !wildcard_superset(a, b), "{id}/{}: checkpoint {i} shadows {j}", t.id);
                        }
                    }
                }
            }
        }
    }

    /// A9 oracle gate: an agent that replays a task's expected_calls (substituting a
    /// wildcard-satisfying value for each `*…*` arg, and retrying through transient
    /// faults) must reach the end state on EVERY authored task — the per-collection
    /// answer-key / satisfiability proof. A no-call agent must fail (the floor).
    #[tokio::test]
    async fn an_oracle_satisfies_every_authored_task_and_a_trivial_agent_fails() {
        use crate::errors::AppResult;
        use crate::inference::eval::agentic::build::sandbox_for;
        use crate::inference::eval::agentic::model_turn::ModelTurn;
        use crate::inference::eval::agentic::runner::run_once;
        use crate::inference::eval::agentic::spec::FaultInjection;
        use crate::inference::generate::generate_spec::GenerateSpec;
        use crate::inference::generate::generate_stats::GenerateStats;
        use serde_json::{json, Value};
        use std::sync::atomic::{AtomicUsize, Ordering};
        use tokio::sync::mpsc::unbounded_channel;

        struct Scripted {
            calls: Vec<String>,
            next: AtomicUsize,
        }
        impl ModelTurn for Scripted {
            async fn run(&self, _s: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
                let i = self.next.fetch_add(1, Ordering::SeqCst);
                // Past the script: emit a no-op (no tool call) → never advances.
                let body = self.calls.get(i).cloned().unwrap_or_else(|| "{}".into());
                Ok((body, GenerateStats { eval_count: Some(1), ..Default::default() }))
            }
        }

        /// Replace each `*…*` string with a concrete value that satisfies the glob
        /// (its literal segments joined in order); keep everything else exact.
        fn concretize(v: &Value) -> Value {
            match v {
                Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), concretize(x))).collect()),
                Value::String(s) if s.contains('*') => {
                    let lit: String = s.split('*').filter(|p| !p.is_empty()).collect();
                    Value::String(if lit.is_empty() { "x".into() } else { lit })
                }
                other => other.clone(),
            }
        }

        for (id, json_str) in V2_SCENARIOS {
            for t in load_v2_collection(json_str).unwrap() {
                let spec = t.agentic.as_ref().unwrap();
                // Build the oracle's call script: each checkpoint, repeated enough to
                // clear a transient fault on its tool (fault fires before the advance).
                let mut calls = Vec::new();
                // A transient fault is keyed by tool NAME (global counter), so the
                // oracle only needs the extra retries on the tool's FIRST occurrence.
                let mut cleared: std::collections::HashSet<String> = std::collections::HashSet::new();
                if let EndStateRule::RequireAll(cps) = &spec.end_state {
                    for cp in cps {
                        let retries = if cleared.insert(cp.tool.clone()) {
                            spec.name_faults
                                .iter()
                                .find(|f| f.on_call == cp.tool)
                                .map(|f| match f.fault {
                                    FaultInjection::TransientError { clears_after, .. } => clears_after as usize,
                                    FaultInjection::PersistentError { .. } => 0,
                                })
                                .unwrap_or(0)
                        } else {
                            0
                        };
                        let body = json!({ "name": cp.tool, "args": concretize(&cp.args) }).to_string();
                        for _ in 0..=retries {
                            calls.push(body.clone());
                        }
                    }
                }
                let (sandbox, cfg) = sandbox_for(&t).unwrap();

                // Oracle-perfect run → reaches the end state, no decoys, no traps.
                let oracle = Scripted { calls, next: AtomicUsize::new(0) };
                let (tx, _rx) = unbounded_channel();
                let ok = run_once(&oracle, &sandbox, cfg.max_steps, cfg.max_recovery, 0, &tx).await.unwrap();
                assert!(ok.reached_end, "{id}/{}: oracle did not reach end state", t.id);
                assert_eq!(ok.unknown_tool_calls, 0, "{id}/{}: oracle hit an unknown tool", t.id);
                assert_eq!(ok.failure, None, "{id}/{}: oracle failed ({:?})", t.id, ok.failure);

                // Trivial floor: a no-call agent never satisfies a RequireAll task.
                if matches!(spec.end_state, EndStateRule::RequireAll(_)) {
                    let lazy = Scripted { calls: vec![], next: AtomicUsize::new(0) };
                    let (tx2, _r2) = unbounded_channel();
                    let bad = run_once(&lazy, &sandbox, cfg.max_steps, cfg.max_recovery, 0, &tx2).await.unwrap();
                    assert!(!bad.reached_end, "{id}/{}: a trivial agent must NOT pass", t.id);
                }
            }
        }
    }

    /// Every nested STRING value in `v` (object values + array elements; object KEYS
    /// are not values, so they're excluded — a key is never a "discovered fact").
    fn string_values(v: &Value, out: &mut Vec<String>) {
        match v {
            Value::String(s) => out.push(s.clone()),
            Value::Array(a) => a.iter().for_each(|x| string_values(x, out)),
            Value::Object(o) => o.values().for_each(|x| string_values(x, out)),
            _ => {}
        }
    }

    /// Replace each `*…*` glob string with its literal segments joined, so a getter's
    /// wildcard discovery arg resolves to a concrete value the responder can key on.
    fn concretize_args(v: &Value) -> Value {
        match v {
            Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), concretize_args(x))).collect()),
            Value::String(s) if s.contains('*') => {
                let lit: String = s.split('*').filter(|p| !p.is_empty()).collect();
                Value::String(if lit.is_empty() { "x".into() } else { lit })
            }
            other => other.clone(),
        }
    }

    /// Answer-key REACHABILITY guard (the inverse of "every entity arg resolves to a
    /// key"): every discovered-only world_state fact a checkpoint forces the model to
    /// echo must be retrievable through SOME getter the model can call. A fact in
    /// world_state but unreachable through any tool (the `es_co_run_failing_test` bug:
    /// the failing test name lived under key `cart_tests`, but `run_tests{module:"cart"}`
    /// resolved nothing) makes the task unsolvable by a real model — only the oracle's
    /// replay "passes" it. Respects `returns_entity`: a getter mistagged as an action
    /// stops surfacing its fact, so this also guards the tags.
    ///
    /// SCOPE: enforced on the **Easy** tier, where checkpoint args are pure retrieval
    /// facts. Medium+ retrieval-chain reachability is a tracked follow-up — those tasks
    /// mix retrieved facts with REASONED conclusions (e.g. the chosen statistical method
    /// in the extreme clinical tasks is derived, not fetched), which this string-needle
    /// heuristic can't distinguish without per-task authoring judgment.
    #[test]
    fn every_required_easy_world_state_fact_is_tool_reachable() {
        use crate::inference::eval::agentic::v2::world_state::derive_response;
        use crate::inference::eval::toolcall::tasks::Call;

        let mut violations: Vec<String> = Vec::new();
        for (id, json) in V2_SCENARIOS {
            let v: Value = serde_json::from_str(json).unwrap();
            if v["tier"].as_str().map(str::to_lowercase).as_deref() != Some("easy") {
                continue; // Medium+ reachability is a tracked follow-up (see doc comment)
            }
            for task in v["tasks"].as_array().into_iter().flatten() {
                let tid = task["id"].as_str().unwrap_or("?");
                let ws = &task["world_state"];
                if ws.is_null() {
                    continue;
                }
                let prompt = task["prompt"].as_str().unwrap_or("").to_lowercase();
                // Getter set: real tools whose `returns_entity` isn't false.
                let getters: HashSet<&str> = task["tools"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|t| t["returns_entity"].as_bool() != Some(false))
                    .filter_map(|t| t["name"].as_str())
                    .collect();
                let calls: Vec<&Value> =
                    task["expected_calls"].as_array().into_iter().flatten().filter(|e| e["type"] == "call").collect();
                // What the model can SURFACE: derive_response over every getter call.
                let mut surfaced = String::new();
                for ec in &calls {
                    let name = ec["name"].as_str().unwrap_or("");
                    if !getters.contains(name) {
                        continue;
                    }
                    let call = Call { name: name.into(), args: concretize_args(&ec["args"]) };
                    surfaced.push_str(&derive_response(ws, &call));
                    surfaced.push('\n');
                }
                // Discovered-only facts: ws string values not already in the prompt.
                let mut ws_vals = Vec::new();
                string_values(ws, &mut ws_vals);
                // Each checkpoint arg literal that DEMANDS a discovered fact must be reachable.
                for ec in &calls {
                    let mut arg_strs = Vec::new();
                    string_values(&ec["args"], &mut arg_strs);
                    for s in &arg_strs {
                        for seg in s.split('*').filter(|p| !p.is_empty()) {
                            for wv in &ws_vals {
                                if wv.len() >= 4
                                    && !prompt.contains(&wv.to_lowercase())
                                    && seg.contains(wv.as_str())
                                    && !surfaced.contains(wv.as_str())
                                {
                                    violations.push(format!("{id}/{tid}: fact '{wv}' is required by a checkpoint but unreachable by any getter"));
                                }
                            }
                        }
                    }
                }
            }
        }
        assert!(violations.is_empty(), "unreachable answer-key facts:\n{}", violations.join("\n"));
    }

    /// Tag guard (all tiers): a retrieval-shaped tool must never be tagged as an action.
    /// A getter mistagged `returns_entity:false` would ack instead of surfacing data, so
    /// a real model could never retrieve the fact (the exact harness-fails-correct-model
    /// bug class). This catches such a mistag structurally — without the false positives
    /// a reasoned-vs-retrieved heuristic carries — so action-tagging stays safe to extend.
    #[test]
    fn no_retrieval_shaped_tool_is_tagged_as_an_action() {
        const GETTER_PREFIX: [&str; 16] = [
            "get_", "check_", "compute_", "run_", "read_", "search_", "classify_", "verify_",
            "validate_", "screen_", "scan_", "assess_", "identify_", "test_", "fit_", "convert_",
        ];
        const GETTER_EXACT: [&str; 6] =
            ["calc", "chem_lookup", "blast_radius", "mark_to_market", "impute_missing", "format_value"];
        let mut violations: Vec<String> = Vec::new();
        for (id, json) in V2_SCENARIOS {
            let v: Value = serde_json::from_str(json).unwrap();
            for task in v["tasks"].as_array().into_iter().flatten() {
                let tid = task["id"].as_str().unwrap_or("?");
                for tool in task["tools"].as_array().into_iter().flatten() {
                    let name = tool["name"].as_str().unwrap_or("");
                    let getter_shaped =
                        GETTER_PREFIX.iter().any(|p| name.starts_with(p)) || GETTER_EXACT.contains(&name);
                    if getter_shaped && tool["returns_entity"].as_bool() == Some(false) {
                        violations.push(format!("{id}/{tid}: getter-shaped tool '{name}' tagged returns_entity:false"));
                    }
                }
            }
        }
        assert!(violations.is_empty(), "retrieval getters mistagged as actions:\n{}", violations.join("\n"));
    }

    #[test]
    fn every_bundled_v2_collection_loads_and_validates() {
        assert_eq!(V2_SCENARIOS.len(), 19);
        for (id, json) in V2_SCENARIOS {
            let tasks = load_v2_collection(json).unwrap_or_else(|e| panic!("collection '{id}' failed to load: {e}"));
            assert!(!tasks.is_empty(), "collection '{id}' has no tasks");
            // Every bundled task routes through the agentic engine.
            assert!(tasks.iter().all(|t| t.category == "agent_loop"), "collection '{id}' must be all agent_loop");
            // The header parses (domain + tier for the picker).
            let h = v2_header(json).unwrap_or_else(|| panic!("collection '{id}' header unparseable"));
            assert!(!h.domain.is_empty() && !h.tier.is_empty(), "collection '{id}' missing domain/tier");
        }
    }
}
