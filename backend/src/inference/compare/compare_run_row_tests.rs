use super::*;
use crate::inference::backend::endpoint;

#[test]
fn ollama_rows_use_the_runs_configured_endpoint() {
    let ep = endpoint_for("http://localhost:9999", BackendKind::Ollama);
    assert_eq!(ep, "http://localhost:9999");
}

#[test]
fn llama_rows_use_the_sidecar_default_not_the_ollama_endpoint() {
    let ep = endpoint_for("http://localhost:9999", BackendKind::LlamaCpp);
    assert_eq!(ep, endpoint::LLAMA_SERVER);
    assert_ne!(ep, "http://localhost:9999");
}

#[test]
fn mlx_rows_use_the_mlx_endpoint_not_the_ollama_endpoint() {
    // MLX resolves via the (dynamic) mlx_endpoint(), never the ollama endpoint.
    let ep = endpoint_for("http://localhost:9999", BackendKind::Mlx);
    assert!(ep.starts_with("http://"));
    assert_ne!(ep, "http://localhost:9999");
}
