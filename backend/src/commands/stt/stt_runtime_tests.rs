use super::*;
use mockito::Server;

#[test]
fn build_spawn_args_has_model_host_port_and_vad_in_order() {
    let args = build_spawn_args("/m/ggml-tiny.en.bin", "/m/ggml-silero-v6.2.0.bin", 8093);
    assert_eq!(
        args,
        vec![
            "-m",
            "/m/ggml-tiny.en.bin",
            "--host",
            "127.0.0.1",
            "--port",
            "8093",
            "--vad",
            "--vad-model",
            "/m/ggml-silero-v6.2.0.bin",
        ]
    );
}

#[test]
fn bin_name_is_platform_specific() {
    let name = bin_name();
    if cfg!(windows) {
        assert_eq!(name, "whisper-server.exe");
    } else {
        assert_eq!(name, "whisper-server");
    }
}

#[tokio::test]
async fn ready_only_on_200_not_503_or_refused() {
    let mut srv = Server::new_async().await;
    let _m = srv.mock("GET", "/health").with_status(200).create_async().await;
    assert!(ready_at(&srv.url(), 1000).await, "200 is ready");

    let mut loading = Server::new_async().await;
    let _l = loading.mock("GET", "/health").with_status(503).create_async().await;
    assert!(!ready_at(&loading.url(), 1000).await, "503 loading is not ready");

    assert!(!ready_at("http://127.0.0.1:1", 1000).await, "refused is not ready");
}

#[tokio::test]
async fn reachable_on_200_and_503_but_not_refused() {
    let mut ok = Server::new_async().await;
    let _o = ok.mock("GET", "/health").with_status(200).create_async().await;
    assert!(reachable_at(&ok.url(), 1000).await);

    let mut loading = Server::new_async().await;
    let _l = loading.mock("GET", "/health").with_status(503).create_async().await;
    assert!(reachable_at(&loading.url(), 1000).await, "up but loading still counts as reachable");

    assert!(!reachable_at("http://127.0.0.1:1", 1000).await, "refused is not reachable");
}

#[cfg(unix)]
#[test]
fn kill_server_terminates_gracefully_and_is_idempotent() {
    let mut child = Command::new("sleep")
        .arg("30")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    // SIGTERM stops `sleep` well within the 2s grace window.
    assert!(kill_server(&mut child).is_ok());
    assert!(matches!(child.try_wait(), Ok(Some(_))), "child exited after kill");
    // A second kill on an already-exited child is a no-op success.
    assert!(kill_server(&mut child).is_ok());
}
