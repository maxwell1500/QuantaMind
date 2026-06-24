use super::*;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
#[tokio::test]
async fn mlx_health_is_unavailable_off_apple_silicon() {
    // Even with a (here, unreachable) endpoint, the AS gate returns false
    // before any HTTP call — MLX is unsupported off Apple Silicon.
    let h = mlx_health("http://localhost:1").await;
    assert!(!h.available);
    assert!(h.version.is_none());
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[tokio::test]
async fn mlx_health_reports_available_when_v1_models_ok() {
    let mut server = mockito::Server::new_async().await;
    let _m = server
        .mock("GET", "/v1/models")
        .with_status(200)
        .with_body("{\"object\":\"list\",\"data\":[]}")
        .create_async()
        .await;
    let h = mlx_health(&server.url()).await;
    assert!(h.available);
    assert!(h.version.is_none());
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[tokio::test]
async fn mlx_health_unavailable_when_connection_refused() {
    let h = mlx_health("http://localhost:1").await;
    assert!(!h.available);
}
