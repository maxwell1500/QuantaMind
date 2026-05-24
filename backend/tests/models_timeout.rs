use quantamind_lib::commands::models::fetch_models_with_timeout;
use quantamind_lib::errors::AppError;
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

/// F7: when Ollama (or anything behind /api/tags) accepts the TCP
/// connection but never sends a response, fetch_models_with_timeout
/// rejects with AppError::Timeout rather than hanging forever.
#[tokio::test]
async fn fetch_models_times_out_on_silent_server() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral");
    let addr = listener.local_addr().expect("local_addr");
    let endpoint = format!("http://{}", addr);

    // Accept and hold every connection open without writing — the client's
    // request will sit waiting until the request timeout fires.
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(30));
                drop(stream);
            });
        }
    });

    let result =
        fetch_models_with_timeout(&endpoint, Duration::from_millis(150)).await;

    match result {
        Err(AppError::Timeout(msg)) => {
            assert!(
                msg.to_lowercase().contains("timed out"),
                "Timeout message should say 'timed out'; got: {msg}"
            );
        }
        other => panic!("expected AppError::Timeout, got {other:?}"),
    }
}
