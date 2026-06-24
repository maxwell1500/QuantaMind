use super::*;

fn task(scoring: Scoring) -> EvalTask {
    EvalTask { id: "t".into(), category: "c".into(), prompt: "p".into(), scoring }
}

#[test]
fn exact_matches_case_insensitively_and_as_substring() {
    let t = task(Scoring::Exact { expected: "POSITIVE".into() });
    assert!(score(&t, "I'd say this is Positive.").passed);
    assert!(!score(&t, "negative").passed);
}

#[test]
fn multiple_choice_takes_the_first_appearing_choice() {
    let t = task(Scoring::MultipleChoice {
        choices: vec!["A".into(), "B".into(), "C".into()],
        expected: "B".into(),
    });
    assert!(score(&t, "The answer is B.").passed);
    // 'A' appears first → wrong even though B is also present.
    assert!(!score(&t, "Not A, but maybe B").passed);
    assert!(!score(&t, "no letters here").passed);
}

#[test]
fn first_json_value_skips_prose_braces_and_handles_nested_string_braces() {
    // A naive first-`{`…last-`}` would grab the prose "{ not json }" and fail to
    // parse; we skip it and return the first *parseable* object.
    let text = "prose { not json } then {\"a\":{\"b\":\"}{\"},\"c\":1} trailing";
    let v = first_json_value(text).expect("a json object");
    assert_eq!(v["c"], serde_json::json!(1));
    assert!(v["a"].is_object());
    assert!(first_json_value("no braces").is_none());
}

#[test]
fn json_schema_passes_on_required_keys_and_matching_types() {
    let t = task(Scoring::JsonSchema {
        required: vec!["name".into(), "args".into()],
        types: BTreeMap::from([("name".into(), "string".into()), ("args".into(), "object".into())]),
    });
    let out = "Sure:\n```json\n{\"name\": \"get_weather\", \"args\": {\"city\": \"Paris\"}}\n```";
    assert!(score(&t, out).passed);
}

#[test]
fn json_schema_fails_on_missing_key_wrong_type_or_prose() {
    let t = task(Scoring::JsonSchema {
        required: vec!["name".into()],
        types: BTreeMap::from([("name".into(), "string".into())]),
    });
    assert!(!score(&t, "{\"args\": {}}").passed); // missing 'name'
    assert!(!score(&t, "{\"name\": 42}").passed); // wrong type
    assert!(!score(&t, "I cannot help with that.").passed); // no JSON
}
