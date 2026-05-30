use super::*;

#[test]
fn empty_models_list_is_rejected() {
    match validate(&[], "hello") {
        Err(AppError::Validation(msg)) => assert!(msg.contains("models")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn empty_prompt_is_rejected() {
    let models = vec!["llama3".to_string()];
    match validate(&models, "") {
        Err(AppError::Validation(msg)) => assert!(msg.contains("prompt")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn whitespace_only_prompt_is_rejected() {
    let models = vec!["llama3".to_string()];
    match validate(&models, "   \n\t  ") {
        Err(AppError::Validation(msg)) => assert!(msg.contains("prompt")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn valid_models_and_prompt_pass() {
    let models = vec!["llama3".to_string()];
    assert!(validate(&models, "hello").is_ok());
}
