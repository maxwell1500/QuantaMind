use super::*;

#[test]
fn whisper_dest_prefixes_ggml_and_sanitizes_the_model_id() {
    let p = whisper_dest(Path::new("/s"), "tiny.en");
    assert_eq!(p, PathBuf::from("/s/ggml-tiny.en.bin"));
    let p = whisper_dest(Path::new("/s"), "large-v3");
    assert_eq!(p, PathBuf::from("/s/ggml-large-v3.bin"));
}

#[test]
fn whisper_dest_replaces_path_separators_from_exotic_ids() {
    let p = whisper_dest(Path::new("/s"), "vendor/tiny:q5");
    assert_eq!(p, PathBuf::from("/s/ggml-vendor_tiny_q5.bin"));
}

#[test]
fn vad_dest_keeps_the_repo_filename_sanitized() {
    let p = vad_dest(Path::new("/s"), "ggml-silero-v5.1.2.bin");
    assert_eq!(p, PathBuf::from("/s/ggml-silero-v5.1.2.bin"));
}

// One test owns QUANTAMIND_STT_DIR — cargo runs tests in parallel, so a second
// env-mutating test would race this one.
#[test]
fn stt_dir_precedence_setting_then_env_then_default() {
    std::env::set_var("QUANTAMIND_STT_DIR", "/tmp/qm-stt-test");
    assert_eq!(stt_dir(), PathBuf::from("/tmp/qm-stt-test"), "env beats default");
    assert_eq!(
        stt_dir_resolved(Some("/models/stt")),
        PathBuf::from("/models/stt"),
        "setting beats env"
    );
    assert_eq!(
        stt_dir_resolved(Some("  ")),
        PathBuf::from("/tmp/qm-stt-test"),
        "blank setting falls through to env"
    );
    std::env::remove_var("QUANTAMIND_STT_DIR");
    assert!(
        stt_dir_resolved(None).ends_with(".quantamind/stt"),
        "default (no env) falls through to ~/.quantamind/stt"
    );
}

#[test]
fn relative_setting_resolves_to_an_absolute_path() {
    let resolved = stt_dir_resolved(Some("./stt"));
    assert!(resolved.is_absolute(), "expected absolute, got {resolved:?}");
    assert!(resolved.ends_with("stt"));
}
