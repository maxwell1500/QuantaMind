use super::*;
use mockito::Server;

/// A trimmed but real-shaped `/api/show` body for an instruct model.
const SHOW_INSTRUCT: &str = r#"{
  "template": "{{- if .System }}<|start_header_id|>system<|end_header_id|>\n{{ .System }}{{- end }}<|start_header_id|>user<|end_header_id|>\n{{ .Prompt }}<|start_header_id|>assistant<|end_header_id|>\n",
  "capabilities": ["completion", "tools"],
  "details": { "family": "llama", "parameter_size": "1.2B", "quantization_level": "Q8_0" },
  "model_info": {
    "general.architecture": "llama",
    "llama.block_count": 16,
    "llama.attention.head_count": 32,
    "llama.attention.head_count_kv": 8,
    "llama.embedding_length": 2048,
    "llama.context_length": 131072
  }
}"#;

#[tokio::test]
async fn parses_template_capabilities_details_and_model_info() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("POST", "/api/show")
        .with_status(200)
        .with_body(SHOW_INSTRUCT)
        .create_async()
        .await;
    let r = show_model(&s.url(), "llama3.2:1b").await.unwrap();
    assert!(r.template.contains("assistant"));
    assert_eq!(r.capabilities, vec!["completion", "tools"]);
    assert_eq!(r.details.parameter_size.as_deref(), Some("1.2B"));
    assert_eq!(r.model_info.get("llama.block_count").and_then(|v| v.as_u64()), Some(16));
}

#[tokio::test]
async fn missing_fields_default_rather_than_error() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("POST", "/api/show")
        .with_status(200)
        .with_body(r#"{"template":""}"#)
        .create_async()
        .await;
    let r = show_model(&s.url(), "bare").await.unwrap();
    assert!(r.template.is_empty());
    assert!(r.capabilities.is_empty());
    assert!(r.model_info.is_empty());
}

#[tokio::test]
async fn http_error_maps_to_not_found() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/show").with_status(404).create_async().await;
    assert!(matches!(show_model(&s.url(), "ghost").await, Err(AppError::NotFound(_))));
}
