use super::*;
use crate::inference::eval::eval_task::Scoring;
use std::path::Path;

#[test]
fn read_evals_parses_yaml_sorted_by_id_and_ignores_non_yaml() {
    let dir = std::env::temp_dir().join("qm_evals_test");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("b.yaml"),
        "id: b-task\ncategory: classification\nprompt: hi\nscoring:\n  method: exact\n  expected: \"X\"\n",
    )
    .unwrap();
    std::fs::write(
        dir.join("a.yaml"),
        "id: a-task\ncategory: reasoning\nprompt: hi\nscoring:\n  method: multiple_choice\n  choices: [\"A\",\"B\"]\n  expected: \"A\"\n",
    )
    .unwrap();
    std::fs::write(dir.join("notes.txt"), "ignore me").unwrap();

    let tasks = read_evals(&dir).expect("read");
    assert_eq!(tasks.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["a-task", "b-task"]);
    assert!(matches!(tasks[1].scoring, Scoring::Exact { .. }));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn bundled_eval_files_all_parse() {
    // Data-quality gate: the shipped docs/evals/*.yaml must be valid.
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/evals");
    let tasks = read_evals(&dir).expect("bundled evals parse");
    assert!(tasks.len() >= 8, "expected the bundled suite, got {}", tasks.len());
    assert!(tasks.iter().any(|t| t.category == "schema"));
}
