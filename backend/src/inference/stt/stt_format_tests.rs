use super::*;
use std::io::Write;

const GGML_HEAD: [u8; 4] = [0x6c, 0x6d, 0x67, 0x67];

fn write_file(bytes: &[u8]) -> tempfile::NamedTempFile {
    let mut f = tempfile::Builder::new().suffix(".bin").tempfile().unwrap();
    f.write_all(bytes).unwrap();
    f.flush().unwrap();
    f
}

/// A ggml file: the magic followed by `len`-total bytes of zero padding.
fn ggml_file(total: usize) -> tempfile::NamedTempFile {
    let mut bytes = GGML_HEAD.to_vec();
    bytes.resize(total, 0);
    write_file(&bytes)
}

#[test]
fn valid_ggml_magic_passes_for_both_kinds() {
    assert!(validate_ggml_magic(&GGML_HEAD, SttModelKind::Whisper).is_ok());
    assert!(validate_ggml_magic(&GGML_HEAD, SttModelKind::Vad).is_ok());
}

#[test]
fn gguf_magic_is_rejected_as_an_llm_file() {
    let err = validate_ggml_magic(b"GGUF", SttModelKind::Whisper).unwrap_err();
    let msg = format!("{err:?}");
    assert!(msg.contains("LLM GGUF"), "expected LLM-specific message, got {msg}");
}

#[test]
fn wrong_and_short_magic_are_rejected() {
    let err = validate_ggml_magic(&[0, 1, 2, 3], SttModelKind::Vad).unwrap_err();
    assert!(format!("{err:?}").contains("ggml marker"));
    assert!(validate_ggml_magic(&[0x6c, 0x6d], SttModelKind::Whisper).is_err(), "too short");
}

#[test]
fn whisper_file_at_min_size_validates() {
    let f = ggml_file(1024 * 1024);
    assert!(validate_stt_model(f.path(), SttModelKind::Whisper).is_ok());
}

#[test]
fn vad_file_below_whisper_floor_still_validates_as_vad() {
    // Real silero VAD is ~885 KB — below the whisper floor, above the VAD floor.
    let f = ggml_file(885 * 1024);
    assert!(validate_stt_model(f.path(), SttModelKind::Vad).is_ok());
    let err = validate_stt_model(f.path(), SttModelKind::Whisper).unwrap_err();
    assert!(format!("{err:?}").contains("too small"), "885 KB is under the whisper floor");
}

#[test]
fn truncated_or_empty_stub_is_rejected_by_size() {
    let f = ggml_file(4096); // ggml magic present but no weights (a stub)
    let err = validate_stt_model(f.path(), SttModelKind::Vad).unwrap_err();
    assert!(format!("{err:?}").contains("too small"));
}

#[test]
fn an_llm_gguf_on_disk_is_rejected_with_guidance() {
    let mut bytes = b"GGUF".to_vec();
    bytes.resize(2 * 1024 * 1024, 0);
    let f = write_file(&bytes);
    let err = validate_stt_model(f.path(), SttModelKind::Whisper).unwrap_err();
    assert!(format!("{err:?}").contains("LLM GGUF"));
}

#[test]
fn wrong_extension_is_rejected() {
    let mut bytes = GGML_HEAD.to_vec();
    bytes.resize(2 * 1024 * 1024, 0);
    let mut f = tempfile::Builder::new().suffix(".gguf").tempfile().unwrap();
    f.write_all(&bytes).unwrap();
    f.flush().unwrap();
    let err = validate_stt_model(f.path(), SttModelKind::Whisper).unwrap_err();
    assert!(format!("{err:?}").contains("not a .bin"));
}
