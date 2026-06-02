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
/// brace text is discarded. `None` when no call is found — so abstention is
/// scoreable.
pub fn extract_calls(completion: &str) -> Option<Vec<Call>> {
    let cleaned = strip_fences(completion);
    let calls: Vec<Call> = objects(&cleaned)
        .into_iter()
        .filter_map(|slice| serde_json::from_str::<Value>(slice).ok())
        .filter_map(to_call)
        .collect();
    (!calls.is_empty()).then_some(calls)
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
    fn none_on_prose_only_and_malformed_json() {
        assert!(extract_calls("I can't help with that, sorry.").is_none());
        assert!(extract_calls("{name: get_weather, city: Paris}").is_none()); // unquoted → not JSON
    }
}
