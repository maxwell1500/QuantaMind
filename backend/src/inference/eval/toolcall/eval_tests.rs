use super::*;
use crate::inference::eval::toolcall::tasks::{Call, Expected};
use serde_json::json;

fn call_task(id: &str) -> ToolTask {
    ToolTask {
        id: id.into(), category: "single".into(), prompt: "p".into(), tools: vec![],
        expected: Expected::Call(Call { name: "x".into(), args: json!({}) }), agentic: None,
    }
}
fn nocall_task(id: &str) -> ToolTask {
    ToolTask { id: id.into(), category: "abstain".into(), prompt: "p".into(), tools: vec![], expected: Expected::NoCall, agentic: None }
}
fn res(id: &str, v: Verdict) -> TaskResult {
    TaskResult { id: id.into(), category: "x".into(), verdict: v, prompt_tokens: None }
}
fn perfect() -> Verdict {
    Verdict { parsed: true, tool_match: true, args_match: true, abstain_correct: None }
}
fn unparsed() -> Verdict {
    Verdict::default()
}

#[test]
fn parse_failure_does_not_lower_tool_or_arg_denominators() {
    // 4 call-tasks: 2 fail to parse, 2 perfect.
    let tasks = vec![call_task("a"), call_task("b"), call_task("c"), call_task("d")];
    let results = vec![res("a", unparsed()), res("b", unparsed()), res("c", perfect()), res("d", perfect())];
    let r = aggregate(&tasks, results);
    assert_eq!(r.parse_rate, Some(0.5)); // 2 parsed / 4 call-tasks
    assert_eq!(r.tool_selection_acc, Some(1.0)); // 2 / 2 PARSED call-tasks, NOT 2/4
    assert_eq!(r.arg_acc, Some(1.0)); // 2 / 2 tool-matched
    assert_eq!(r.abstain_acc, None); // no NoCall tasks → n/a
    assert!((r.composite.unwrap() - (0.5 + 1.0 + 1.0) / 3.0).abs() < 1e-9);
}

#[test]
fn correct_abstention_doesnt_drag_down_parse_rate() {
    let tasks = vec![call_task("a"), nocall_task("b")];
    let abstain_ok = Verdict { parsed: false, tool_match: false, args_match: false, abstain_correct: Some(true) };
    let results = vec![res("a", perfect()), res("b", abstain_ok)];
    let r = aggregate(&tasks, results);
    assert_eq!(r.parse_rate, Some(1.0)); // 1/1 call-task parsed; the abstain task is excluded
    assert_eq!(r.abstain_acc, Some(1.0)); // 1/1 NoCall correct
    assert_eq!(r.composite, Some((1.0 + 1.0 + 1.0 + 1.0) / 4.0)); // parse, tool, arg, abstain all 1.0
}
