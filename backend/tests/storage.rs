use mockito::Server;
use quantamind_lib::commands::storage::storage::{fetch_installed_with_stats, remove_model_inner};
use quantamind_lib::commands::storage::storage_disk::compute_disk_usage;
use quantamind_lib::errors::AppError;
use std::path::Path;

#[tokio::test]
async fn fetch_installed_parses_details_and_sorts_by_size_desc() {
    let mut s = Server::new_async().await;
    let body = r#"{"models":[
        {"name":"small:1b","modified_at":"2024-12-01","size":1000000,
         "details":{"family":"llama","parameter_size":"1B","quantization_level":"Q8_0"}},
        {"name":"big:8b","modified_at":"2024-12-02","size":4900000000,
         "details":{"family":"llama","parameter_size":"8B","quantization_level":"Q4_K_M"}},
        {"name":"mid:3b","modified_at":"2024-12-03","size":2000000000,
         "details":{"family":"phi","parameter_size":"3.8B","quantization_level":"Q4_K_M"}}
    ]}"#;
    let _m = s.mock("GET", "/api/tags").with_status(200).with_body(body).create_async().await;

    let out = fetch_installed_with_stats(&s.url()).await.expect("should parse");
    assert_eq!(out.len(), 3);
    // Sorted by size descending: big -> mid -> small
    assert_eq!(out[0].name, "big:8b");
    assert_eq!(out[0].size_bytes, 4_900_000_000);
    assert_eq!(out[0].family, "llama");
    assert_eq!(out[0].parameter_size, "8B");
    assert_eq!(out[0].quantization, "Q4_K_M");
    assert_eq!(out[1].name, "mid:3b");
    assert_eq!(out[2].name, "small:1b");
    // Ollama-listed models are tagged backend=ollama (serialized snake_case).
    let json = serde_json::to_string(&out[0]).expect("serialize");
    assert!(json.contains(r#""backend":"ollama""#), "json: {json}");
}

#[tokio::test]
async fn remove_model_404_maps_to_not_found_error() {
    let mut s = Server::new_async().await;
    let _m = s.mock("DELETE", "/api/delete").with_status(404).create_async().await;
    match remove_model_inner(&s.url(), "ghost:1b").await {
        Err(AppError::NotFound(msg)) => assert!(msg.contains("ghost:1b"), "msg: {msg}"),
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[tokio::test]
async fn remove_model_200_returns_ok_with_correct_body() {
    let mut s = Server::new_async().await;
    let m = s.mock("DELETE", "/api/delete")
        .match_body(r#"{"name":"phi3.5:latest"}"#)
        .with_status(200)
        .create_async().await;
    remove_model_inner(&s.url(), "phi3.5:latest").await.expect("should succeed");
    m.assert_async().await;
}

#[tokio::test]
async fn remove_model_empty_name_rejected_before_http() {
    let mut s = Server::new_async().await;
    let m = s.mock("DELETE", "/api/delete").expect(0).create_async().await;
    match remove_model_inner(&s.url(), "  ").await {
        Err(AppError::Validation(msg)) => assert!(msg.contains("empty")),
        other => panic!("expected Validation, got {other:?}"),
    }
    m.assert_async().await;
}

#[test]
fn disk_usage_carries_models_bytes_through_unchanged() {
    // Even when total/free can't be determined, the caller-supplied
    // models_bytes sum must round-trip exactly.
    let usage = compute_disk_usage(Path::new("/__nonexistent_zzz/test"), 12345);
    assert_eq!(usage.ollama_models_bytes, 12345);
}

#[test]
fn disk_usage_for_a_real_path_reports_nonzero_total_and_sensible_free() {
    let cwd = std::env::current_dir().expect("cwd should be available");
    let usage = compute_disk_usage(&cwd, 0);
    assert!(usage.total_bytes > 0, "real disk should have non-zero total");
    assert!(usage.free_bytes <= usage.total_bytes, "free should not exceed total");
}
