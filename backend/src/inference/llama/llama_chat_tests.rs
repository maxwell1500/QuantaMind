use super::parse_chat;
use serde_json::json;

#[test]
fn parses_tool_calls_with_object_arguments() {
    // llama.cpp builds that hand back `arguments` as a real object.
    let body = json!({
        "choices": [{ "message": {
            "content": "",
            "tool_calls": [{ "function": { "name": "get_weather", "arguments": { "city": "Paris" } } }]
        }}],
        "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
    })
    .to_string();
    let r = parse_chat(&body).unwrap();
    assert_eq!(r.tool_calls.len(), 1);
    assert_eq!(r.tool_calls[0].name, "get_weather");
    assert_eq!(r.tool_calls[0].args, json!({ "city": "Paris" }));
}

#[test]
fn parses_tool_calls_with_stringified_arguments() {
    // The OpenAI-spec shape: `arguments` is a JSON string — normalize_args must
    // parse it back to an object so checkpoint/arg matching compares objects.
    let body = json!({
        "choices": [{ "message": {
            "tool_calls": [{ "function": { "name": "run_tests", "arguments": "{\"module\": \"cart\"}" } }]
        }}]
    })
    .to_string();
    let r = parse_chat(&body).unwrap();
    assert_eq!(r.tool_calls.len(), 1);
    assert_eq!(r.tool_calls[0].args, json!({ "module": "cart" }));
}

#[test]
fn surfaces_plain_content_when_no_tool_calls() {
    let body = json!({ "choices": [{ "message": { "content": "Paris is the capital." } }] }).to_string();
    let r = parse_chat(&body).unwrap();
    assert!(r.tool_calls.is_empty());
    assert_eq!(r.content, "Paris is the capital.");
}

#[test]
fn empty_choices_is_a_clean_empty_result() {
    let r = parse_chat(&json!({ "choices": [] }).to_string()).unwrap();
    assert!(r.tool_calls.is_empty());
    assert_eq!(r.content, "");
}

#[test]
fn prefers_timings_over_usage_for_per_phase_stats() {
    // llama-server's `timings` (prompt/predict ms) must drive stats, not the
    // token-count-only `usage` — so the prefill ms reaches the Inspector.
    let body = json!({
        "choices": [{ "message": { "content": "hi" } }],
        "usage": { "prompt_tokens": 99 },
        "timings": { "prompt_n": 12, "prompt_ms": 210.7, "predicted_n": 5, "predicted_ms": 80.0 }
    })
    .to_string();
    let r = parse_chat(&body).unwrap();
    assert_eq!(r.stats.prompt_eval_ms, Some(211), "prefill ms present (rounded)");
    assert_eq!(r.stats.prompt_eval_count, Some(12), "from timings.prompt_n, not usage.prompt_tokens");
}
