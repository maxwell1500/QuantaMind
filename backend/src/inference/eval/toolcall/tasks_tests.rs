use super::*;

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
