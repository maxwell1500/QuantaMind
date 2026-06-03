use super::*;
use crate::inference::eval::toolcall::tasks::{Call, Expected, ToolSchema, ToolTask};
use serde_json::json;
use tempfile::tempdir;

fn sample() -> Vec<ToolTask> {
    vec![ToolTask {
        id: "w".into(),
        category: "single".into(),
        prompt: "Weather in Paris?".into(),
        tools: vec![ToolSchema {
            name: "get_weather".into(),
            description: "Get weather".into(),
            parameters: json!({ "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }),
        }],
        expected: Expected::Call(Call { name: "get_weather".into(), args: json!({ "city": "Paris" }) }),
    }]
}

#[test]
fn list_missing_dir_is_empty() {
    let dir = tempdir().unwrap();
    assert!(list(&dir.path().join("evals")).unwrap().is_empty());
}

#[test]
fn save_then_list_load_round_trips() {
    let dir = tempdir().unwrap();
    save(dir.path(), "my_suite", &sample()).unwrap();
    assert_eq!(list(dir.path()).unwrap(), vec!["my_suite".to_string()]);
    assert_eq!(load(dir.path(), "my_suite").unwrap(), sample());
}

#[test]
fn delete_removes_collection() {
    let dir = tempdir().unwrap();
    save(dir.path(), "my_suite", &sample()).unwrap();
    delete(dir.path(), "my_suite").unwrap();
    assert!(list(dir.path()).unwrap().is_empty());
    assert!(matches!(delete(dir.path(), "my_suite"), Err(AppError::NotFound(_))));
}

#[test]
fn load_malformed_json_errors() {
    let dir = tempdir().unwrap();
    std::fs::create_dir_all(dir.path()).unwrap();
    std::fs::write(dir.path().join("broken.json"), "{ not json").unwrap();
    assert!(matches!(load(dir.path(), "broken"), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn load_invalid_task_rejected() {
    let dir = tempdir().unwrap();
    std::fs::create_dir_all(dir.path()).unwrap();
    // valid JSON, but category 'abstain' with a Call expected → invalid task
    let bad = json!([{ "id": "x", "category": "abstain", "prompt": "p",
        "tools": [{ "name": "t", "description": "d", "parameters": { "type": "object", "properties": {} } }],
        "expected": { "type": "call", "name": "t", "args": {} } }]);
    std::fs::write(dir.path().join("bad.json"), bad.to_string()).unwrap();
    assert!(matches!(load(dir.path(), "bad"), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn oversize_file_is_capped() {
    let dir = tempdir().unwrap();
    std::fs::create_dir_all(dir.path()).unwrap();
    let big = vec![b' '; (MAX_BYTES + 1) as usize];
    std::fs::write(dir.path().join("big.json"), big).unwrap();
    assert!(matches!(load(dir.path(), "big"), Err(AppError::Validation(_))));
}

#[test]
fn save_invalid_tasks_rejected() {
    let dir = tempdir().unwrap();
    assert!(matches!(save(dir.path(), "empty", &[]), Err(AppError::InvalidTaskSchema(_))));
}

#[test]
fn bad_names_rejected() {
    let dir = tempdir().unwrap();
    for name in ["../escape", "a/b", "", "..", ".hidden"] {
        assert!(sanitize_name(name).is_err(), "should reject {name:?}");
        assert!(load(dir.path(), name).is_err());
    }
}
