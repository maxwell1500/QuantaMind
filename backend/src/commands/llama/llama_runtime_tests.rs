use super::*;

#[test]
fn spawn_args_pass_model_path_host_port_jinja_and_context() {
    let args = build_spawn_args("/models/foo.gguf", 8081, 8192, None);
    assert_eq!(
        args,
        vec![
            "-m",
            "/models/foo.gguf",
            "--host",
            "127.0.0.1",
            "--port",
            "8081",
            "--jinja",
            "-c",
            "8192"
        ]
    );
}

#[test]
fn spawn_args_reflect_a_custom_port() {
    let args = build_spawn_args("/m/x.gguf", 9090, 4096, None);
    assert!(args.windows(2).any(|w| w == ["--port", "9090"]));
}

/// `--jinja` is what makes the chat endpoint apply the model's embedded
/// template; its absence is the loop bug, so guard it explicitly.
#[test]
fn spawn_args_always_include_jinja() {
    let args = build_spawn_args("/m/x.gguf", 8081, 4096, None);
    assert!(args.iter().any(|a| a == "--jinja"));
}

/// A resolved override file is appended as `--chat-template-file <path>`; absent,
/// no such flag (the embedded template via `--jinja` is the default).
#[test]
fn spawn_args_append_chat_template_file_only_when_present() {
    let with = build_spawn_args("/m/x.gguf", 8081, 4096, Some("/cfg/chat_templates/gemma.jinja"));
    assert!(with.windows(2).any(|w| w == ["--chat-template-file", "/cfg/chat_templates/gemma.jinja"]));
    let without = build_spawn_args("/m/x.gguf", 8081, 4096, None);
    assert!(!without.iter().any(|a| a == "--chat-template-file"));
}

#[test]
fn jinja_unsupported_detects_rejected_flag_signature() {
    let mut tail = std::collections::VecDeque::new();
    tail.push_back("error: invalid argument: --jinja".to_string());
    assert!(jinja_unsupported(&tail));

    let mut other = std::collections::VecDeque::new();
    other.push_back("error while handling argument \"--jinja\"".to_string());
    assert!(jinja_unsupported(&other));
}

#[test]
fn jinja_unsupported_ignores_benign_stderr() {
    let mut tail = std::collections::VecDeque::new();
    tail.push_back("llama_model_loader: loaded meta data".to_string());
    tail.push_back("main: server listening on 127.0.0.1:8081".to_string());
    assert!(!jinja_unsupported(&tail));
}

/// With no sidecar listening on 8081, the health probe reports unavailable (not an
/// error) — the shape the frontend poll + batch pre-flight rely on.
#[tokio::test]
async fn health_reports_unavailable_when_no_server_is_running() {
    let h = check_llama_health().await;
    assert!(!h.available);
    assert_eq!(h.version, None);
}
