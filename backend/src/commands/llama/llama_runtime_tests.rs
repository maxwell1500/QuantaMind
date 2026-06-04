use super::*;

#[test]
fn spawn_args_pass_model_path_host_and_port() {
    let args = build_spawn_args("/models/foo.gguf", 8081);
    assert_eq!(
        args,
        vec!["-m", "/models/foo.gguf", "--host", "127.0.0.1", "--port", "8081"]
    );
}

#[test]
fn spawn_args_reflect_a_custom_port() {
    let args = build_spawn_args("/m/x.gguf", 9090);
    assert!(args.windows(2).any(|w| w == ["--port", "9090"]));
}
