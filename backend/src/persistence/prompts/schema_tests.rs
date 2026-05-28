use super::*;

#[test]
fn default_params_serialize_as_empty_map() {
    let yaml = serde_yaml::to_string(&InferenceParams::default()).unwrap();
    assert_eq!(yaml.trim(), "{}");
}

#[test]
fn partial_params_round_trip() {
    let p = InferenceParams { temperature: Some(0.7), seed: Some(42), ..Default::default() };
    let yaml = serde_yaml::to_string(&p).unwrap();
    let back: InferenceParams = serde_yaml::from_str(&yaml).unwrap();
    assert_eq!(p, back);
    assert!(!yaml.contains("top_p"));
    assert!(!yaml.contains("max_tokens"));
}

#[test]
fn prompt_file_round_trip_preserves_all_fields() {
    let pf = PromptFile {
        name: "summarize".into(),
        system: "You are concise.".into(),
        user: "Summarize this.".into(),
        model: Some("llama3".into()),
        params: InferenceParams { temperature: Some(0.5), top_k: Some(40), ..Default::default() },
        created_at: "2026-05-27T10:00:00Z".into(),
        updated_at: "2026-05-27T10:01:00Z".into(),
        auto_rerun: true,
    };
    let yaml = serde_yaml::to_string(&pf).unwrap();
    let back: PromptFile = serde_yaml::from_str(&yaml).unwrap();
    assert_eq!(pf, back);
}

#[test]
fn missing_optional_fields_load_with_defaults() {
    let yaml = "name: hello\ncreated_at: t1\nupdated_at: t2\n";
    let pf: PromptFile = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(pf.system, "");
    assert_eq!(pf.user, "");
    assert_eq!(pf.model, None);
    assert_eq!(pf.params, InferenceParams::default());
    assert!(!pf.auto_rerun);
}

#[test]
fn eyeball_typical_prompt_yaml() {
    let pf = PromptFile {
        name: "summarize-article".into(),
        system: "You are a precise summarizer.".into(),
        user: "Summarize the article above in 3 bullets.".into(),
        model: Some("llama3.2:1b".into()),
        params: InferenceParams { temperature: Some(0.5), top_k: Some(40), seed: Some(42), ..Default::default() },
        created_at: "2026-05-27T10:00:00Z".into(),
        updated_at: "2026-05-27T10:00:00Z".into(),
        auto_rerun: true,
    };
    println!("---\n{}", serde_yaml::to_string(&pf).unwrap());
}

#[test]
fn auto_rerun_false_is_omitted() {
    let pf = PromptFile {
        name: "n".into(), system: "".into(), user: "".into(), model: None,
        params: InferenceParams::default(),
        created_at: "t".into(), updated_at: "t".into(), auto_rerun: false,
    };
    let yaml = serde_yaml::to_string(&pf).unwrap();
    assert!(!yaml.contains("auto_rerun"));
}
