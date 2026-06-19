use super::*;
use crate::inference::eval::agentic::sandbox::{EndStateRule, MockResponse, TaskCheckpoint};
use crate::inference::eval::agentic::spec::AgenticSpec;
use crate::inference::eval::toolcall::tasks::Call;
use serde_json::json;

fn valid_task() -> ToolTask {
    ToolTask {
        id: "w".into(),
        category: "single".into(),
        prompt: "Weather in Paris?".into(),
        tools: vec![ToolSchema {
            name: "get_weather".into(),
            description: "Get weather".into(),
            parameters: json!({ "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }),
        }],
        expected: Expected::Call(Call { name: "get_weather".into(), args: json!({ "city": "Paris" }) }),
        agentic: None,
    }
}

#[test]
fn fixture_round_trips_through_serde() {
    let original = tasks();
    let json = serde_json::to_string(&original).unwrap();
    let back: Vec<ToolTask> = serde_json::from_str(&json).unwrap();
    assert_eq!(original, back);
}

#[test]
fn bundled_fixture_passes_validation() {
    validate_tasks(&tasks()).expect("bundled fixture is valid");
}

#[test]
fn finance_preset_is_valid_and_covers_categories() {
    let f = finance_tasks();
    validate_tasks(&f).expect("finance preset is valid");
    for cat in ["single", "select", "parallel", "abstain"] {
        assert!(f.iter().any(|t| t.category == cat), "finance missing category: {cat}");
    }
}

#[test]
fn builtin_collection_routes_known_ids() {
    assert!(builtin_collection("curated").is_some());
    assert!(builtin_collection("finance").is_some());
    assert!(builtin_collection("agentic").is_some());
    assert!(builtin_collection("nope").is_none());
}

#[test]
fn agentic_preset_is_valid_and_all_agentic() {
    let a = agentic_tasks();
    validate_tasks(&a).expect("agentic preset is valid");
    assert!(a.iter().all(|t| t.category == "agentic"), "agentic preset must be all agentic");
    assert!(a.len() >= 2, "expected a require-sequence + an abstention task");
}

#[test]
fn multi_step_agentic_presets_validate_with_expected_counts() {
    for (id, n) in [("agentic_3", 3usize), ("agentic_5", 5), ("agentic_8", 8)] {
        let tasks = builtin_collection(id).unwrap_or_else(|| panic!("preset {id} missing"));
        validate_tasks(&tasks).unwrap_or_else(|e| panic!("preset {id} invalid: {e}"));
        assert_eq!(tasks.len(), n, "preset {id} task count");
        assert!(tasks.iter().all(|t| t.category == "agentic"), "preset {id} all agentic");
    }
}

#[test]
fn rejects_empty_collection() {
    assert!(matches!(validate_tasks(&[]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_empty_tools() {
    let mut t = valid_task();
    t.tools.clear();
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_unknown_category() {
    let mut t = valid_task();
    t.category = "smoke".into();
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_required_naming_undeclared_property() {
    let mut t = valid_task();
    t.tools[0].parameters = json!({ "type": "object", "properties": { "city": { "type": "string" } }, "required": ["country"] });
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_parameters_missing_properties() {
    let mut t = valid_task();
    t.tools[0].parameters = json!({ "type": "object" });
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_category_expected_mismatch() {
    let mut t = valid_task();
    t.category = "abstain".into(); // but expected is a Call
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_call_to_unoffered_tool() {
    let mut t = valid_task();
    t.expected = Expected::Call(Call { name: "send_email".into(), args: json!({}) });
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn fixture_loads_expected_count_and_categories() {
    let t = tasks();
    assert!(t.len() >= 12, "expected the curated suite, got {}", t.len());
    for cat in ["single", "parallel", "select", "abstain"] {
        assert!(t.iter().any(|x| x.category == cat), "missing category: {cat}");
    }
}

#[test]
fn every_task_has_tools_and_a_coherent_expected() {
    for task in tasks() {
        assert!(!task.id.is_empty());
        assert!(!task.tools.is_empty(), "{} has no tools", task.id);
        match task.expected.calls() {
            // A call must name a tool that's actually offered to the model.
            Some(calls) => {
                assert!(!calls.is_empty());
                for c in calls {
                    assert!(task.tools.iter().any(|t| t.name == c.name), "{}: calls unknown tool {}", task.id, c.name);
                }
                assert_ne!(task.category, "abstain");
            }
            None => assert_eq!(task.category, "abstain"),
        }
    }
}

// --- Agentic data-model (Phase 1) -----------------------------------------

fn agentic_valid() -> ToolTask {
    let tool = |n: &str| ToolSchema {
        name: n.into(),
        description: "d".into(),
        parameters: json!({ "type": "object", "properties": {} }),
    };
    ToolTask {
        id: "fin".into(),
        category: "agentic".into(),
        prompt: "Check the balance then transfer it.".into(),
        tools: vec![tool("get_balance"), tool("transfer")],
        expected: Default::default(), // unused by the agentic path
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
            max_steps: None,
            faults: vec![],
            max_recovery: None,
        }),
    }
}

#[test]
fn agentic_task_validates() {
    validate_tasks(&[agentic_valid()]).expect("valid agentic task");
}

#[test]
fn rejects_agentic_without_spec() {
    let mut t = agentic_valid();
    t.agentic = None;
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn agent_loop_category_validates_like_agentic() {
    use crate::inference::eval::toolcall::tasks::is_agentic;
    assert!(is_agentic("agentic") && is_agentic("agent_loop"));
    assert!(!is_agentic("single") && !is_agentic("abstain"));
    let mut t = agentic_valid();
    t.id = "v2".into();
    t.category = "agent_loop".into(); // the Phase 9-v2 category
    validate_tasks(&[t]).expect("agent_loop validates on the agentic path");
}

#[test]
fn rejects_agent_loop_without_spec() {
    let mut t = agentic_valid();
    t.category = "agent_loop".into();
    t.agentic = None;
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_spec_on_non_agentic_task() {
    let mut t = agentic_valid();
    t.category = "single".into();
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_end_state_checkpoint_naming_unknown_tool() {
    let mut t = agentic_valid();
    if let Some(s) = t.agentic.as_mut() {
        s.end_state = EndStateRule::RequireSequence(vec![TaskCheckpoint { tool: "ghost".into(), args: json!({}) }]);
    }
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn rejects_mock_referencing_unknown_tool() {
    let mut t = agentic_valid();
    if let Some(s) = t.agentic.as_mut() {
        s.mocks = vec![MockResponse { call: Call { name: "ghost".into(), args: json!({}) }, response: "{}".into() }];
    }
    assert!(matches!(validate_tasks(&[t]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn abstaining_agentic_task_needs_no_checkpoints() {
    let mut t = agentic_valid();
    if let Some(s) = t.agentic.as_mut() {
        s.end_state = EndStateRule::ExpectAbstainingText;
        s.mocks.clear();
    }
    validate_tasks(&[t]).expect("expect_abstaining_text is valid with no checkpoints");
}

#[test]
fn single_turn_serialization_omits_the_agentic_key() {
    // The skip_serializing_if guard is load-bearing: existing single-turn
    // collections must round-trip with no `"agentic"` key appearing.
    let json = serde_json::to_string(&tasks()).unwrap();
    assert!(!json.contains("\"agentic\""), "single-turn tasks must not serialize an agentic key");
}

#[test]
fn agentic_task_round_trips_through_serde() {
    let original = agentic_valid();
    let json = serde_json::to_string(&original).unwrap();
    assert!(json.contains("\"agentic\""));
    let back: ToolTask = serde_json::from_str(&json).unwrap();
    assert_eq!(original, back);
}

#[test]
fn pre_phase9_agentic_fixture_saves_without_leaking_tier_or_axes_keys() {
    // Back-compat: the bundled (pre-Phase-9) agentic collection loads as Easy/None
    // and re-serializes with no new keys — a saved collection stays byte-compatible.
    use crate::inference::eval::toolcall::tasks::agentic_tasks;
    let loaded = agentic_tasks();
    let json = serde_json::to_string(&loaded).unwrap();
    assert!(!json.contains("\"tier\""), "default Easy tier must be omitted on save");
    assert!(!json.contains("\"axes\""), "absent axes must be omitted on save");
}
