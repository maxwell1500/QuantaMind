use crate::inference::eval::toolcall::score::args_match;
use crate::inference::eval::toolcall::tasks::Call;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Phase 9-v2 arg matcher. Same structural shape as `score::args_match` (same key
/// set, each value matched), but a string expected value containing `*` is an
/// **ordered multi-segment, case-insensitive glob**; every other value (exact
/// strings, numbers, bools, nested objects/arrays) delegates to the UNCHANGED
/// `args_match`, so v1 exact semantics are preserved and a v1 checkpoint routed
/// through here with no `*` behaves identically.
pub fn args_match_v2(expected: &Value, got: &Value) -> bool {
    match (expected.as_object(), got.as_object()) {
        (Some(e), Some(g)) => {
            e.len() == g.len() && e.iter().all(|(k, ev)| g.get(k).is_some_and(|gv| value_match(ev, gv)))
        }
        _ => value_match(expected, got),
    }
}

/// G3: does free-text `candidate` satisfy a checkpoint's text glob `pattern`? Reuses the
/// exact v2 string semantics (ordered case-insensitive multi-segment glob for `*…*`
/// patterns, trimmed exact otherwise). Used to detect a model that reported the answer in
/// prose instead of routing it through the required reporter tool.
pub fn text_matches(pattern: &str, candidate: &str) -> bool {
    value_match(&Value::String(pattern.to_string()), &Value::String(candidate.to_string()))
}

fn value_match(expected: &Value, got: &Value) -> bool {
    match expected {
        // Glob applies ONLY to string patterns; a string pattern vs a non-string
        // candidate is a non-match (no coercion).
        Value::String(p) if p.contains('*') => match got {
            Value::String(c) => glob_match(p, c),
            _ => false,
        },
        // Everything else: exact, via the v1 matcher (handles nested objects,
        // numeric equality `250.0 == 250`, trimmed strings — case-SENSITIVE).
        _ => args_match(expected, got),
    }
}

/// Ordered multi-segment glob: split the pattern on `*`, drop empty segments, and
/// require each remaining literal to occur in the candidate in order, left-to-right,
/// non-overlapping. Leading/trailing `*` impose no anchor; a lone `*` (no literals)
/// matches any non-empty value. Case-insensitive (authored wildcard args are prose).
fn glob_match(pattern: &str, candidate: &str) -> bool {
    let hay = candidate.to_lowercase();
    let segments: Vec<String> =
        pattern.to_lowercase().split('*').filter(|s| !s.is_empty()).map(str::to_string).collect();
    if segments.is_empty() {
        return !candidate.trim().is_empty(); // lone "*" → any non-empty string
    }
    let mut pos = 0;
    for seg in &segments {
        match hay[pos..].find(seg.as_str()) {
            Some(i) => pos += i + seg.len(),
            None => return false,
        }
    }
    true
}

/// A `must_not_call` trap entry: a bare tool name (forbidden with any args) or a
/// specific `{name, args}` pair (forbidden only on a wildcard-aware args match, so a
/// forbidden arg may itself glob). `#[serde(untagged)]` so a JSON string → `Name`
/// and an object → `Pair`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum MustNotCall {
    Name(String),
    Pair { name: String, args: Value },
}

impl MustNotCall {
    /// Does `call` spring this trap? Bare name → any args to that name; pair → name
    /// AND `args_match_v2`. NEVER short-circuits a pair on name alone.
    pub fn matches(&self, call: &Call) -> bool {
        match self {
            MustNotCall::Name(name) => &call.name == name,
            MustNotCall::Pair { name, args } => &call.name == name && args_match_v2(args, &call.args),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(pattern: &str, candidate: &str) -> bool {
        args_match_v2(&json!(pattern), &json!(candidate))
    }

    #[test]
    fn glob_is_ordered_multi_segment_case_insensitive() {
        assert!(p("*15230.5*", "balance is 15230.5 INR"));
        assert!(p("*TN*24*", "approved: TN mandate 24mo"));
        assert!(!p("*TN*24*", "24 units for TN")); // order violated
        assert!(p("*renal*warfarin*", "hold: renal + warfarin interaction"));
        assert!(p("*denied*", "Request Denied")); // case-insensitive
        assert!(p("*", "anything")); // lone star → any non-empty
        assert!(!p("*x*", "")); // empty candidate
    }

    #[test]
    fn no_star_is_exact_and_case_sensitive() {
        assert!(p("denied", "denied"));
        assert!(!p("denied", "request denied")); // exact, not substring
        assert!(!p("Active", "active")); // exact is case-SENSITIVE
    }

    #[test]
    fn numbers_are_exact_strings_dont_coerce_to_numbers() {
        assert!(args_match_v2(&json!({ "amount": 250 }), &json!({ "amount": 250.0 })));
        // string glob pattern vs numeric candidate → no coercion, no match.
        assert!(!args_match_v2(&json!({ "x": "*5*" }), &json!({ "x": 1500 })));
    }

    #[test]
    fn object_args_match_per_key_with_glob_and_exact_mixed() {
        let expected = json!({ "account": "M-3", "reason": "*liquidat*" });
        assert!(args_match_v2(&expected, &json!({ "account": "M-3", "reason": "partial liquidation" })));
        assert!(!args_match_v2(&expected, &json!({ "account": "M-4", "reason": "partial liquidation" })));
        // extra/missing key → non-match (same key-set discipline as v1).
        assert!(!args_match_v2(&expected, &json!({ "account": "M-3" })));
    }

    #[test]
    fn must_not_call_bare_name_vs_pair() {
        let bare: MustNotCall = serde_json::from_value(json!("override_policy")).unwrap();
        assert!(bare.matches(&Call { name: "override_policy".into(), args: json!({ "x": 1 }) }));
        assert!(!bare.matches(&Call { name: "issue_refund".into(), args: json!({}) }));

        let pair: MustNotCall =
            serde_json::from_value(json!({ "name": "issue_refund", "args": { "order_id": "4472" } })).unwrap();
        assert!(pair.matches(&Call { name: "issue_refund".into(), args: json!({ "order_id": "4472" }) }));
        // SAME tool, allowed args → not forbidden (no name-only short-circuit).
        assert!(!pair.matches(&Call { name: "issue_refund".into(), args: json!({ "order_id": "C-402" }) }));
    }
}
