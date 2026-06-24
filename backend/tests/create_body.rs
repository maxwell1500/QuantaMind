use quantamind_lib::inference::chat::chat_template_data::LLAMA3;
use quantamind_lib::inference::create::create_body::build_create_body;
use quantamind_lib::inference::create::create_spec::{CreateParameters, CreateSpec};
use std::path::PathBuf;

fn spec_minimal() -> CreateSpec {
    CreateSpec {
        gguf_path: PathBuf::from("/abs/path/test-model.gguf"),
        chat_template: None,
        parameters: CreateParameters::default(),
    }
}

#[test]
fn minimal_body_has_model_and_files() {
    let body = build_create_body(&spec_minimal(), "qmtest:latest", "abcdef").unwrap();
    let obj = body.as_object().unwrap();
    assert_eq!(obj["model"], "qmtest:latest");
    let files = obj["files"].as_object().unwrap();
    assert_eq!(files["test-model.gguf"], "sha256:abcdef");
    assert!(obj.get("template").is_none());
    assert!(obj.get("parameters").is_none());
}

#[test]
fn template_carries_string_and_stops_into_parameters() {
    let spec = CreateSpec { chat_template: Some(LLAMA3), ..spec_minimal() };
    let body = build_create_body(&spec, "x:latest", "deadbeef").unwrap();
    let obj = body.as_object().unwrap();
    assert_eq!(obj["template"], LLAMA3.template_string);
    let stops = obj["parameters"]["stop"].as_array().unwrap();
    for tok in LLAMA3.stop_tokens {
        assert!(stops.iter().any(|s| s == tok), "missing stop: {tok}");
    }
}

#[test]
fn user_parameters_round_trip() {
    let spec = CreateSpec {
        parameters: CreateParameters {
            temperature: Some(0.7), top_p: Some(0.9), top_k: Some(40),
            repeat_penalty: Some(1.1), stop: vec!["</s>".into()],
        },
        ..spec_minimal()
    };
    let body = build_create_body(&spec, "x:latest", "00").unwrap();
    let p = &body["parameters"];
    let approx = |v: &serde_json::Value, want: f64| (v.as_f64().unwrap() - want).abs() < 1e-5;
    assert!(approx(&p["temperature"], 0.7));
    assert!(approx(&p["top_p"], 0.9));
    assert_eq!(p["top_k"], 40);
    assert!(approx(&p["repeat_penalty"], 1.1));
    assert_eq!(p["stop"][0], "</s>");
}

#[test]
fn path_with_no_filename_errors_with_validation() {
    let spec = CreateSpec {
        gguf_path: PathBuf::from("/"),
        chat_template: None,
        parameters: CreateParameters::default(),
    };
    match build_create_body(&spec, "x:latest", "00") {
        Err(quantamind_lib::errors::AppError::Validation(msg)) =>
            assert!(msg.contains("no filename"), "msg: {msg}"),
        other => panic!("expected Validation, got {other:?}"),
    }
}
