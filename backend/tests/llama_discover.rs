use quantamind_lib::commands::llama::llama_discover::discover_gguf_models;
use quantamind_lib::inference::backend::backend_kind::BackendKind;
use std::io::Write;

fn write_str(b: &mut Vec<u8>, s: &str) {
    b.extend_from_slice(&(s.len() as u64).to_le_bytes());
    b.extend_from_slice(s.as_bytes());
}

// Minimal valid GGUF header (arch only); quant comes from the filename.
fn make_gguf(arch: &str) -> Vec<u8> {
    let mut b = Vec::new();
    b.extend_from_slice(b"GGUF");
    b.extend_from_slice(&3u32.to_le_bytes()); // version
    b.extend_from_slice(&0u64.to_le_bytes()); // tensor count
    b.extend_from_slice(&1u64.to_le_bytes()); // kv count
    write_str(&mut b, "general.architecture");
    b.extend_from_slice(&8u32.to_le_bytes()); // string type
    write_str(&mut b, arch);
    b
}

fn write_gguf(dir: &std::path::Path, name: &str, arch: &str) {
    let path = dir.join(name);
    let mut f = std::fs::File::create(&path).expect("create");
    f.write_all(&make_gguf(arch)).expect("header");
    f.write_all(&vec![0u8; 64 * 1024]).expect("pad to >= 64KB");
}

#[test]
fn discovers_gguf_files_tagged_llama_cpp_and_skips_others() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_gguf(dir.path(), "phi3-mini-q4_k_m.gguf", "phi3");
    std::fs::write(dir.path().join("notes.txt"), b"not a model").expect("txt");

    let models = discover_gguf_models(&[dir.path()]);
    assert_eq!(models.len(), 1, "only the .gguf is discovered");
    let m = &models[0];
    assert_eq!(m.name, "phi3-mini-q4_k_m");
    assert_eq!(m.backend, BackendKind::LlamaCpp);
    assert_eq!(m.quantization, "Q4_K_M", "quant recovered from filename");
    assert!(!m.family.is_empty(), "family derived from architecture");
    assert!(m.size_bytes > 64 * 1024);

    // Serializes with the snake_case backend tag the frontend expects.
    let json = serde_json::to_string(m).expect("serialize");
    assert!(json.contains(r#""backend":"llama_cpp""#), "json: {json}");
}

#[test]
fn empty_directory_yields_no_models() {
    let dir = tempfile::tempdir().expect("tempdir");
    assert!(discover_gguf_models(&[dir.path()]).is_empty());
}

#[test]
fn missing_directory_is_skipped_not_an_error() {
    let models = discover_gguf_models(&[std::path::Path::new("/no/such/dir/zzz")]);
    assert!(models.is_empty());
}
