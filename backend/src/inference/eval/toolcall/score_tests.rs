use super::*;
use serde_json::json;

fn call(name: &str, args: serde_json::Value) -> Call {
    Call { name: name.into(), args }
}
fn single(name: &str, args: serde_json::Value) -> Expected {
    Expected::Call(call(name, args))
}

#[test]
fn exact_call_full_score() {
    let v = score(&single("get_weather", json!({"city":"Paris"})), Some(&[call("get_weather", json!({"city":"Paris"}))]));
    assert_eq!(v, Verdict { parsed: true, tool_match: true, args_match: true, abstain_correct: None });
}

#[test]
fn wrong_name_fails_selection() {
    let v = score(&single("get_weather", json!({"city":"Paris"})), Some(&[call("get_time", json!({"city":"Paris"}))]));
    assert!(v.parsed && !v.tool_match && !v.args_match);
}

#[test]
fn wrong_arg_value_fails_args_but_keeps_tool() {
    let v = score(&single("get_weather", json!({"city":"Paris"})), Some(&[call("get_weather", json!({"city":"London"}))]));
    assert!(v.tool_match && !v.args_match);
}

#[test]
fn missing_or_extra_arg_fails_args() {
    let exp = single("get_weather", json!({"city":"Paris"}));
    assert!(!score(&exp, Some(&[call("get_weather", json!({}))])).args_match); // missing
    assert!(!score(&exp, Some(&[call("get_weather", json!({"city":"Paris","unit":"c"}))])).args_match); // spurious
}

#[test]
fn parallel_set_match_ignores_order() {
    let exp = Expected::Parallel { calls: vec![
        call("get_weather", json!({"city":"Paris"})),
        call("get_weather", json!({"city":"Tokyo"})),
    ] };
    let got = [call("get_weather", json!({"city":"Tokyo"})), call("get_weather", json!({"city":"Paris"}))];
    let v = score(&exp, Some(&got));
    assert!(v.tool_match && v.args_match);
}

#[test]
fn parallel_length_guard_fails_when_three_returned_for_two_expected() {
    let exp = Expected::Parallel { calls: vec![call("a", json!({})), call("b", json!({}))] };
    let got = [call("a", json!({})), call("b", json!({})), call("c", json!({}))];
    let v = score(&exp, Some(&got));
    assert!(!v.tool_match && !v.args_match);
}

#[test]
fn abstain_correct_on_none_wrong_on_spurious_call() {
    assert_eq!(score(&Expected::NoCall, None).abstain_correct, Some(true));
    assert_eq!(score(&Expected::NoCall, Some(&[call("get_weather", json!({}))])).abstain_correct, Some(false));
}
