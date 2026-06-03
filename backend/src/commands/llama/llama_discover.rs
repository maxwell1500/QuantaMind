use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::gguf::gguf::inspect_gguf;
use crate::time_iso::format_secs;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Scan `dirs` for `*.gguf` files, returning one model entry per readable GGUF
/// tagged `backend=llama_cpp`. Non-`.gguf` and unreadable files are skipped.
/// Pure (no Tauri), so discovery is asserted directly in tests.
pub fn discover_gguf_models(dirs: &[&Path]) -> Vec<InstalledModelInfo> {
    let mut out = Vec::new();
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if is_gguf(&path) {
                if let Some(info) = model_from_path(&path) {
                    out.push(info);
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn is_gguf(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false)
}

fn model_from_path(path: &Path) -> Option<InstalledModelInfo> {
    let meta = inspect_gguf(path).ok()?;
    let md = fs::metadata(path).ok()?;
    let modified_at = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| format_secs(d.as_secs() as i64))
        .unwrap_or_default();
    Some(InstalledModelInfo {
        name: path.file_stem()?.to_string_lossy().into_owned(),
        size_bytes: md.len(),
        modified_at,
        family: meta.family,
        parameter_size: format_params(meta.parameter_count),
        quantization: meta.quantization.unwrap_or_default(),
        backend: BackendKind::LlamaCpp,
        digest: String::new(),
        display_name: None,
        path: Some(path.to_string_lossy().into_owned()),
    })
}

/// Human-readable parameter count (`1.2B`, `350M`) from a raw GGUF count.
fn format_params(count: Option<u64>) -> String {
    match count {
        Some(n) if n >= 1_000_000_000 => format!("{:.1}B", n as f64 / 1e9),
        Some(n) if n >= 1_000_000 => format!("{}M", n / 1_000_000),
        Some(n) => n.to_string(),
        None => String::new(),
    }
}
