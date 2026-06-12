use crate::inference::eval::toolcall::tasks::Call;
use serde_json::Value;

fn strip_fences(s: &str) -> String {
    s.replace("```json", "").replace("```", "")
}

/// Every top-level balanced `{…}` slice in `text` (string/escape aware). Nested
/// objects stay inside their parent; array brackets are ignored (not braces).
fn objects(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let (mut depth, mut start, mut in_str, mut esc) = (0i32, 0usize, false, false);
    let mut out = Vec::new();
    for (i, &b) in bytes.iter().enumerate() {
        let c = b as char;
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
            '{' => {
                if depth == 0 {
                    start = i;
                }
                depth += 1;
            }
            '}' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    out.push(&text[start..=i]);
                }
            }
            _ => {}
        }
    }
    out
}

fn to_call(v: Value) -> Option<Call> {
    let obj = v.as_object()?;
    let name = obj.get("name")?.as_str()?.to_string();
    let args = obj
        .get("args")
        .or_else(|| obj.get("arguments"))
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    Some(Call { name, args })
}

/// Greedily extract every parseable top-level JSON object and map the ones that
/// look like a tool call (`{name, args|arguments}`) to `Call`. Handles a single
/// object, a JSON array (the brackets aren't braces, so inner objects are
/// found), AND bare `{..}\n{..}` sequences that small quants emit. Non-parsing
/// brace text is discarded. Identical (name+args) calls are collapsed so a
/// chatty model that prints its call inline AND echoes it in a trailing fence
/// isn't wrongly failed by the cardinality guard; distinct parallel calls stay.
/// `None` when no call is found — so abstention is scoreable.
pub fn extract_calls(completion: &str) -> Option<Vec<Call>> {
    let cleaned = strip_fences(completion);
    let mut calls: Vec<Call> = Vec::new();
    for call in objects(&cleaned)
        .into_iter()
        .filter_map(|slice| serde_json::from_str::<Value>(slice).ok())
        .filter_map(to_call)
    {
        if !calls.contains(&call) {
            calls.push(call);
        }
    }
    (!calls.is_empty()).then_some(calls)
}

/// Does the text contain at least one balanced `{…}` slice that parses as JSON?
/// The agentic runner uses this to tell a structured fake-completion (valid JSON
/// object, just no `name` → a `task_complete` claim) from broken-JSON noise.
pub(crate) fn has_json_object(text: &str) -> bool {
    let cleaned = strip_fences(text);
    objects(&cleaned).into_iter().any(|s| serde_json::from_str::<Value>(s).is_ok())
}

/// A yield turn whose text has a `{` but no parseable JSON object — the model
/// tried to emit a call and produced broken JSON. Pure prose, or valid-but-not-a
/// -call JSON, is NOT broken (that's a hallucinated completion).
pub(crate) fn looks_like_broken_json(text: &str) -> bool {
    text.contains('{') && !has_json_object(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_clean_json_object() {
        let calls = extract_calls("{\"name\":\"get_weather\",\"args\":{\"city\":\"Paris\"}}").unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_weather");
        assert_eq!(calls[0].args, json!({"city":"Paris"}));
    }

    #[test]
    fn extracts_from_markdown_fence() {
        let calls = extract_calls("Sure:\n```json\n{\"name\":\"get_time\",\"args\":{\"timezone\":\"Tokyo\"}}\n```").unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_time");
    }

    #[test]
    fn extracts_parallel_array() {
        let calls = extract_calls("[{\"name\":\"a\",\"args\":{}},{\"name\":\"b\",\"args\":{}}]").unwrap();
        assert_eq!(calls.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["a", "b"]);
    }

    #[test]
    fn extracts_two_sequential_objects_without_an_array() {
        // Small quants emit bare sequential objects, no enclosing array.
        let calls = extract_calls("{\"name\":\"a\",\"args\":{}}\n{\"name\":\"b\",\"args\":{}}").unwrap();
        assert_eq!(calls.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["a", "b"]);
    }

    #[test]
    fn nested_args_object_captured_whole() {
        let calls = extract_calls("call: {\"name\":\"x\",\"args\":{\"a\":{\"b\":1}}} done").unwrap();
        assert_eq!(calls[0].args, json!({"a":{"b":1}}));
    }

    #[test]
    fn collapses_inline_call_echoed_in_a_fence() {
        // Chatty model: the call inline, then prose, then the SAME call re-stated
        // in a ```json block. After de-fencing both copies survive as objects —
        // dedup keeps exactly one so the cardinality guard doesn't false-fail.
        let calls = extract_calls(
            "[{\"name\":\"get_weather\",\"args\":{\"city\":\"Paris\"}}]\nHere's why:\n```json\n{\"name\":\"get_weather\",\"args\":{\"city\":\"Paris\"}}\n```",
        )
        .unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "get_weather");
        assert_eq!(calls[0].args, json!({"city":"Paris"}));
    }

    #[test]
    fn distinct_parallel_calls_are_not_collapsed() {
        // Same tool, different args → genuine parallel calls, both kept.
        let calls =
            extract_calls("[{\"name\":\"a\",\"args\":{\"x\":1}},{\"name\":\"a\",\"args\":{\"x\":2}}]").unwrap();
        assert_eq!(calls.len(), 2);
    }

    #[test]
    fn none_on_prose_only_and_malformed_json() {
        assert!(extract_calls("I can't help with that, sorry.").is_none());
        assert!(extract_calls("{name: get_weather, city: Paris}").is_none()); // unquoted → not JSON
    }
}
