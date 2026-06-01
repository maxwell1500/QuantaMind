use super::*;

#[test]
fn to_info_tags_mlx_and_leaves_size_quant_blank() {
    let m = to_info("mlx-community/Llama-3.2-3B-Instruct-4bit".into());
    assert_eq!(m.name, "mlx-community/Llama-3.2-3B-Instruct-4bit");
    assert_eq!(m.backend, BackendKind::Mlx);
    assert_eq!(m.size_bytes, 0);
    assert!(m.quantization.is_empty() && m.parameter_size.is_empty());
    assert!(m.path.is_none());
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
#[tokio::test]
async fn fetch_is_empty_off_apple_silicon() {
    let models = fetch_mlx_models("http://localhost:1").await.unwrap();
    assert!(models.is_empty());
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[tokio::test]
async fn fetch_maps_v1_models_entries() {
    let mut server = mockito::Server::new_async().await;
    let _m = server
        .mock("GET", "/v1/models")
        .with_status(200)
        .with_body("{\"object\":\"list\",\"data\":[{\"id\":\"stub-a\"},{\"id\":\"stub-b\"}]}")
        .create_async()
        .await;
    let models = fetch_mlx_models(&server.url()).await.unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].name, "stub-a");
    assert_eq!(models[1].backend, BackendKind::Mlx);
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[tokio::test]
async fn fetch_is_empty_when_server_unreachable() {
    let models = fetch_mlx_models("http://localhost:1").await.unwrap();
    assert!(models.is_empty());
}
