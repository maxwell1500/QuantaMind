use super::*;
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
