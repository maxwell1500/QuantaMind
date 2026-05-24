use mockito::Server;
use quantamind_lib::commands::health::probe_health;

#[tokio::test]
async fn available_with_version_on_200() {
    let mut srv = Server::new_async().await;
    let _m = srv
        .mock("GET", "/api/version")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{"version":"0.1.32"}"#)
        .create_async()
        .await;

    let h = probe_health(&srv.url()).await;
    assert!(h.available);
    assert_eq!(h.version.as_deref(), Some("0.1.32"));
}

#[tokio::test]
async fn unavailable_on_5xx() {
    let mut srv = Server::new_async().await;
    let _m = srv
        .mock("GET", "/api/version")
        .with_status(503)
        .create_async()
        .await;

    let h = probe_health(&srv.url()).await;
    assert!(!h.available);
    assert!(h.version.is_none());
}

#[tokio::test]
async fn unavailable_on_connection_refused() {
    // Port 1 reliably refuses on macOS/Linux.
    let h = probe_health("http://127.0.0.1:1").await;
    assert!(!h.available);
    assert!(h.version.is_none());
}

#[tokio::test]
async fn available_no_version_on_malformed_body() {
    let mut srv = Server::new_async().await;
    let _m = srv
        .mock("GET", "/api/version")
        .with_status(200)
        .with_body("not json")
        .create_async()
        .await;

    let h = probe_health(&srv.url()).await;
    assert!(h.available);
    assert!(h.version.is_none());
}
