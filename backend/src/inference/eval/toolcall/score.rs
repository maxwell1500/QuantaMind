use crate::inference::eval::toolcall::tasks::{Call, Expected};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Verdict {
    pub parsed: bool,
    pub tool_match: bool,
    pub args_match: bool,
    /// `Some` only for abstention (NoCall) tasks.
    pub abstain_correct: Option<bool>,
}

fn value_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::String(x), Value::String(y)) => x.trim() == y.trim(),
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        _ => a == b,
    }
}

/// Structural arg equality: same key set (no spurious or missing keys), each
/// value equal (numbers numerically, strings trimmed). `pub(crate)` so the
/// agentic end-state matcher reuses the exact same equality the scorer uses.
pub(crate) fn args_match(expected: &Value, got: &Value) -> bool {
    match (expected.as_object(), got.as_object()) {
        (Some(e), Some(g)) => {
            e.len() == g.len() && e.iter().all(|(k, ev)| g.get(k).is_some_and(|gv| value_equal(ev, gv)))
        }
        _ => value_equal(expected, got),
    }
}

/// Is there a 1:1 assignment of each expected call to a *distinct* parsed call
/// satisfying `eq`? Greedy consume — sound for the tiny N here.
fn bijection(expected: &[Call], parsed: &[Call], eq: impl Fn(&Call, &Call) -> bool) -> bool {
    let mut used = vec![false; parsed.len()];
    'next: for e in expected {
        for (i, p) in parsed.iter().enumerate() {
            if !used[i] && eq(e, p) {
                used[i] = true;
                continue 'next;
            }
        }
        return false;
    }
    true
}

/// (tool_match, args_match) with a length guard first: a different number of
/// calls means the model hallucinated an extra or missed one → both fail.
fn set_match(expected: &[Call], parsed: &[Call]) -> (bool, bool) {
    if expected.len() != parsed.len() {
        return (false, false);
    }
    let tool = bijection(expected, parsed, |e, p| e.name == p.name);
    let args = bijection(expected, parsed, |e, p| e.name == p.name && args_match(&e.args, &p.args));
    (tool, args)
}

/// Did a task pass overall? For a call-task: parsed + right tool + right args;
/// for an abstention: the model correctly made no call. The single per-task
/// pass/fail the batch scoreboard renders.
pub(crate) fn verdict_passed(v: &Verdict) -> bool {
    match v.abstain_correct {
        Some(ok) => ok,
        None => v.parsed && v.tool_match && v.args_match,
    }
}

/// Score one task. Pure.
pub fn score(expected: &Expected, parsed: Option<&[Call]>) -> Verdict {
    match expected.calls() {
        None => Verdict { parsed: parsed.is_some(), abstain_correct: Some(parsed.is_none()), ..Default::default() },
        Some(exp) => match parsed {
            None => Verdict::default(),
            Some(got) => {
                let (tool_match, args_match) = set_match(exp, got);
                Verdict { parsed: true, tool_match, args_match, abstain_correct: None }
            }
        },
    }
}

#[cfg(test)]
#[path = "score_tests.rs"]
mod tests;
