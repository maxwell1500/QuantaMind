use crate::inference::eval::eval_task::{EvalTask, Scoring};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct EvalScore {
    pub passed: bool,
    pub detail: String,
}

fn norm(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Drop markdown code-fence markers so JSON inside a ```json … ``` block is
/// reachable by the extractor.
fn strip_fences(s: &str) -> String {
    s.replace("```json", "").replace("```", "")
}

/// The balanced `{…}` slice starting at `start` (string/escape aware), or None
/// if it never closes.
fn balanced_from(text: &str, start: usize) -> Option<&str> {
    let bytes = text.as_bytes();
    let (mut depth, mut in_str, mut esc) = (0i32, false, false);
    for i in start..bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&text[start..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

/// First balanced `{…}` object that actually parses as JSON — skips prose braces
/// (e.g. "see { the note }") that precede the real object. Brace-counting, not a
/// naive first-`{`…last-`}` substring.
pub fn first_json_value(text: &str) -> Option<Value> {
    for (i, &b) in text.as_bytes().iter().enumerate() {
        if b == b'{' {
            if let Some(slice) = balanced_from(text, i) {
                if let Ok(v) = serde_json::from_str::<Value>(slice) {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn type_matches(v: &Value, ty: &str) -> bool {
    match ty {
        "string" => v.is_string(),
        "number" => v.is_number(),
        "boolean" => v.is_boolean(),
        "object" => v.is_object(),
        "array" => v.is_array(),
        "null" => v.is_null(),
        _ => false,
    }
}

fn fail(detail: impl Into<String>) -> EvalScore {
    EvalScore { passed: false, detail: detail.into() }
}

/// Flat (depth-1) JSON-conformance check: required keys present + declared
/// top-level types match. No recursion into nested objects/arrays.
fn score_json(output: &str, required: &[String], types: &BTreeMap<String, String>) -> EvalScore {
    let cleaned = strip_fences(output);
    let Some(val) = first_json_value(&cleaned) else {
        return fail("no JSON object found in output");
    };
    let Some(obj) = val.as_object() else {
        return fail("top-level JSON is not an object");
    };
    for key in required {
        if !obj.contains_key(key) {
            return fail(format!("missing key: {key}"));
        }
    }
    for (key, ty) in types {
        match obj.get(key) {
            Some(v) if type_matches(v, ty) => {}
            Some(_) => return fail(format!("key '{key}' is not {ty}")),
            None => return fail(format!("missing typed key: {key}")),
        }
    }
    EvalScore { passed: true, detail: "valid JSON · schema matched".into() }
}

/// The first whole-word token in `output` that equals one of `choices` — so a
/// letter choice "A" matches the word "A", not the "a" inside "answer".
fn first_choice(output: &str, choices: &[String]) -> Option<String> {
    let wanted: Vec<String> = choices.iter().map(|c| norm(c)).collect();
    output
        .split(|c: char| !c.is_alphanumeric())
        .map(norm)
        .find(|tok| !tok.is_empty() && wanted.contains(tok))
}

/// Deterministically score `output` against a task's rule. Pure.
pub fn score(task: &EvalTask, output: &str) -> EvalScore {
    match &task.scoring {
        Scoring::Exact { expected } => {
            let pass = norm(output).contains(&norm(expected));
            EvalScore { passed: pass, detail: if pass { "matched".into() } else { format!("expected '{expected}'") } }
        }
        Scoring::MultipleChoice { choices, expected } => {
            let pick = first_choice(output, choices);
            let pass = pick.as_deref() == Some(norm(expected).as_str());
            EvalScore {
                passed: pass,
                detail: pick.map(|c| format!("chose '{c}'")).unwrap_or_else(|| "no choice found".into()),
            }
        }
        Scoring::JsonSchema { required, types } => score_json(output, required, types),
    }
}

#[cfg(test)]
#[path = "eval_score_tests.rs"]
mod tests;
