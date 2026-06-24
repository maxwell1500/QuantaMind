use quantamind_lib::errors::AppError;
use quantamind_lib::inference::gguf::gguf::inspect_gguf;
use std::io::Write;

mod common {
    pub fn write_str(b: &mut Vec<u8>, s: &str) {
        b.extend_from_slice(&(s.len() as u64).to_le_bytes());
        b.extend_from_slice(s.as_bytes());
    }
    pub fn make_gguf(arch: &str, file_type: u32) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"GGUF");
        b.extend_from_slice(&3u32.to_le_bytes());
        b.extend_from_slice(&0u64.to_le_bytes());
        b.extend_from_slice(&2u64.to_le_bytes());
        write_str(&mut b, "general.architecture");
        b.extend_from_slice(&8u32.to_le_bytes());
        write_str(&mut b, arch);
        write_str(&mut b, "general.file_type");
        b.extend_from_slice(&4u32.to_le_bytes());
        b.extend_from_slice(&file_type.to_le_bytes());
        b
    }
}

#[test]
fn filename_quant_overrides_unknown_file_type() {
    let bytes = common::make_gguf("llama", 9999);
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("llama3-8b-q5_k_m.gguf");
    let mut f = std::fs::File::create(&path).expect("create");
    f.write_all(&bytes).expect("write");
    f.write_all(&vec![0u8; 64 * 1024]).expect("pad to >= 64KB");
    drop(f);
    let m = inspect_gguf(&path).expect("inspect");
    assert_eq!(m.quantization.as_deref(), Some("Q5_K_M"));
    assert_eq!(m.architecture, "llama");
}

#[test]
fn rejects_non_gguf_file_extension() {
    let tmp = tempfile::Builder::new().suffix(".txt").tempfile().expect("tempfile");
    match inspect_gguf(tmp.path()) {
        Err(AppError::Validation(msg)) => assert!(msg.contains("not a .gguf"), "msg: {msg}"),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn rejects_file_smaller_than_64kb() {
    let mut tmp = tempfile::Builder::new().suffix(".gguf").tempfile().expect("tempfile");
    tmp.write_all(b"tiny").expect("write");
    match inspect_gguf(tmp.path()) {
        Err(AppError::Validation(msg)) => assert!(msg.contains("too small"), "msg: {msg}"),
        other => panic!("expected Validation, got {other:?}"),
    }
}
