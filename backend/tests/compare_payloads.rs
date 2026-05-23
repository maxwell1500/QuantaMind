use splice_lib::commands::compare_payloads::{
    CompareDonePayload, CompareTokenPayload, RunCompareArgs, Strategy,
};

#[test]
fn token_payload_uses_snake_case_fields() {
    let p = CompareTokenPayload {
        model_id: "row-1".into(),
        model: "llama3.2:1b".into(),
        text: "hi".into(),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains(r#""model_id":"row-1""#), "{json}");
    assert!(json.contains(r#""model":"llama3.2:1b""#));
    assert!(json.contains(r#""text":"hi""#));
}

#[test]
fn strategy_serializes_as_snake_case_variants() {
    assert_eq!(serde_json::to_string(&Strategy::Sequential).unwrap(), r#""sequential""#);
    assert_eq!(serde_json::to_string(&Strategy::Parallel).unwrap(), r#""parallel""#);
    assert_eq!(
        serde_json::to_string(&Strategy::SequentialSkippable).unwrap(),
        r#""sequential_skippable""#,
    );
}

#[test]
fn run_compare_args_deserializes_from_snake_case() {
    let raw = r#"{"models":["a","b"],"prompt":"hi","strategy":"parallel"}"#;
    let args: RunCompareArgs = serde_json::from_str(raw).unwrap();
    assert_eq!(args.models, vec!["a", "b"]);
    assert_eq!(args.prompt, "hi");
    assert_eq!(args.strategy, Strategy::Parallel);
}

#[test]
fn done_payload_includes_optional_metric_fields() {
    let p = CompareDonePayload {
        model_id: "id".into(),
        model: "m".into(),
        ttft_ms: Some(42),
        tokens_per_sec: Some(38.2),
        token_count: 218,
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains(r#""ttft_ms":42"#));
    assert!(json.contains(r#""tokens_per_sec":38.2"#));
    assert!(json.contains(r#""token_count":218"#));
}
