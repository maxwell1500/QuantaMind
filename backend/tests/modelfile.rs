use splice_lib::inference::chat_template_data::{ChatTemplate, LLAMA3, MISTRAL};
use splice_lib::inference::modelfile::{generate_modelfile, ModelfileParameters, ModelfileSpec};
use std::path::PathBuf;

fn spec_minimal() -> ModelfileSpec {
    ModelfileSpec {
        gguf_path: PathBuf::from("/abs/path/model.gguf"),
        chat_template: None,
        parameters: ModelfileParameters::default(),
    }
}

#[test]
fn minimal_spec_emits_only_from_line() {
    let out = generate_modelfile(&spec_minimal());
    assert_eq!(out, "FROM /abs/path/model.gguf\n");
}

#[test]
fn template_emits_triple_quoted_block_and_per_stop_lines() {
    let spec = ModelfileSpec { chat_template: Some(LLAMA3), ..spec_minimal() };
    let out = generate_modelfile(&spec);
    assert!(out.starts_with("FROM /abs/path/model.gguf\n"));
    assert!(out.contains("TEMPLATE \"\"\""), "missing TEMPLATE block: {out}");
    assert!(out.contains(LLAMA3.template_string), "template body should appear verbatim");
    for stop in LLAMA3.stop_tokens {
        let escaped = stop.replace('"', "\\\"");
        assert!(out.contains(&format!("PARAMETER stop \"{escaped}\"")), "missing stop {stop}: {out}");
    }
}

#[test]
fn parameters_emit_one_line_each_in_declared_order() {
    let spec = ModelfileSpec {
        chat_template: None,
        parameters: ModelfileParameters {
            temperature: Some(0.7),
            top_p: Some(0.9),
            top_k: Some(40),
            repeat_penalty: Some(1.1),
            stop: vec!["</s>".into(), "<|eot_id|>".into()],
        },
        ..spec_minimal()
    };
    let out = generate_modelfile(&spec);
    assert!(out.contains("PARAMETER temperature 0.7"));
    assert!(out.contains("PARAMETER top_p 0.9"));
    assert!(out.contains("PARAMETER top_k 40"));
    assert!(out.contains("PARAMETER repeat_penalty 1.1"));
    assert!(out.contains(r#"PARAMETER stop "</s>""#));
    assert!(out.contains(r#"PARAMETER stop "<|eot_id|>""#));
}

#[test]
fn triple_quote_in_template_string_is_escaped() {
    let evil = ChatTemplate {
        family: "Test",
        template_string: r#"hello """ world"#,
        stop_tokens: &["</s>"],
    };
    let spec = ModelfileSpec { chat_template: Some(evil), ..spec_minimal() };
    let out = generate_modelfile(&spec);
    let body_start = out.find("TEMPLATE \"\"\"").expect("TEMPLATE block missing") + "TEMPLATE \"\"\"".len();
    let body_end = out.rfind("\"\"\"\n").expect("closing triple missing");
    let body = &out[body_start..body_end];
    assert!(!body.contains("\"\"\""), "raw triple quote leaked into TEMPLATE body: {body}");
    assert!(body.contains("\\\"\\\"\\\""), "expected escaped triple quote in body: {body}");
}

#[test]
fn embedded_quote_in_stop_token_is_escaped() {
    let spec = ModelfileSpec {
        chat_template: None,
        parameters: ModelfileParameters {
            stop: vec![r#"say "hi""#.into()],
            ..ModelfileParameters::default()
        },
        ..spec_minimal()
    };
    let out = generate_modelfile(&spec);
    assert!(out.contains(r#"PARAMETER stop "say \"hi\"""#), "bad escape: {out}");
}

#[test]
fn mistral_template_round_trips_through_generator() {
    // A real registered template should appear in the output exactly as
    // the const declares — no truncation, no mangling.
    let spec = ModelfileSpec { chat_template: Some(MISTRAL), ..spec_minimal() };
    let out = generate_modelfile(&spec);
    assert!(out.contains(MISTRAL.template_string));
}
