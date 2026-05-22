use splice_lib::errors::AppError;
use splice_lib::inference::gguf::inspect_gguf_bytes;

fn write_str(b: &mut Vec<u8>, s: &str) {
    b.extend_from_slice(&(s.len() as u64).to_le_bytes());
    b.extend_from_slice(s.as_bytes());
}

/// Minimal valid GGUF v3 header: version 3, tensor_count 0, four KV
/// pairs (architecture, parameter_count, {arch}.context_length,
/// file_type) in that fixed order.
pub fn make_gguf(arch: &str, param_count: u64, context_length: u32, file_type: u32) -> Vec<u8> {
    let mut b = Vec::new();
    b.extend_from_slice(b"GGUF");
    b.extend_from_slice(&3u32.to_le_bytes());
    b.extend_from_slice(&0u64.to_le_bytes());
    b.extend_from_slice(&4u64.to_le_bytes());
    write_str(&mut b, "general.architecture");
    b.extend_from_slice(&8u32.to_le_bytes());
    write_str(&mut b, arch);
    write_str(&mut b, "general.parameter_count");
    b.extend_from_slice(&10u32.to_le_bytes());
    b.extend_from_slice(&param_count.to_le_bytes());
    write_str(&mut b, &format!("{arch}.context_length"));
    b.extend_from_slice(&4u32.to_le_bytes());
    b.extend_from_slice(&context_length.to_le_bytes());
    write_str(&mut b, "general.file_type");
    b.extend_from_slice(&4u32.to_le_bytes());
    b.extend_from_slice(&file_type.to_le_bytes());
    b
}

#[test]
fn parses_llama_8b_q4_k_m_metadata() {
    let bytes = make_gguf("llama", 8_030_000_000, 8192, 15);
    let m = inspect_gguf_bytes(&bytes).expect("should parse");
    assert_eq!(m.architecture, "llama");
    assert_eq!(m.parameter_count, Some(8_030_000_000));
    assert_eq!(m.context_length, Some(8192));
    assert_eq!(m.quantization.as_deref(), Some("Q4_K_M"));
    assert_eq!(m.family, "Llama");
}

#[test]
fn rejects_missing_gguf_magic() {
    let mut b = b"NOPE".to_vec();
    b.extend_from_slice(&3u32.to_le_bytes());
    b.extend_from_slice(&[0u8; 16]);
    assert!(matches!(inspect_gguf_bytes(&b), Err(AppError::Validation(_))));
}

#[test]
fn rejects_unsupported_version() {
    let mut b = b"GGUF".to_vec();
    b.extend_from_slice(&99u32.to_le_bytes());
    b.extend_from_slice(&[0u8; 16]);
    match inspect_gguf_bytes(&b) {
        Err(AppError::Validation(msg)) => assert!(msg.contains("99"), "msg: {msg}"),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn truncated_header_returns_validation_error_not_panic() {
    let bytes = make_gguf("llama", 8_000_000_000, 8192, 15);
    assert!(matches!(inspect_gguf_bytes(&bytes[..30]), Err(AppError::Validation(_))));
}

#[test]
fn family_inferred_from_architecture() {
    for (arch, family) in [
        ("llama", "Llama"), ("qwen2", "Qwen 2"), ("qwen3", "Qwen 3"),
        ("mistral", "Mistral"), ("phi3", "Phi-3"), ("gemma2", "Gemma 2"),
        ("starcoder2", "StarCoder"), ("nomic-bert", "Nomic-bert"),
    ] {
        let m = inspect_gguf_bytes(&make_gguf(arch, 100, 4096, 1)).expect("parse");
        assert_eq!(m.family, family, "arch={arch}");
    }
}

#[test]
fn unsupported_file_type_yields_none_quant_without_filename_context() {
    let bytes = make_gguf("llama", 8_000_000_000, 8192, 9999);
    let m = inspect_gguf_bytes(&bytes).expect("parse");
    assert_eq!(m.quantization, None);
}
