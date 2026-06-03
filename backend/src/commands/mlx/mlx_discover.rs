use crate::commands::mlx::mlx_install::REPO_MARKER;
use crate::commands::storage::storage_types::InstalledModelInfo;
use crate::inference::backend::backend_kind::BackendKind;
use crate::time_iso::format_secs;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Scan `dirs` for MLX model folders, returning one entry per folder that holds
/// a `config.json` AND at least one `*.safetensors`. `name` is the absolute dir
/// path (the value `mlx_lm.server --model <dir>` reports as its id, so it
/// matches the wire model field); `display_name` is the friendly HF repo from
/// the `.qm-repo` marker. Pure (no Tauri) so it's asserted directly in tests.
pub fn discover_mlx_models(dirs: &[&Path]) -> Vec<InstalledModelInfo> {
    let mut out = Vec::new();
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && is_mlx_model(&path) {
                if let Some(info) = model_from_dir(&path) {
                    out.push(info);
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// An MLX model folder = a `config.json` plus at least one safetensors shard.
fn is_mlx_model(dir: &Path) -> bool {
    if !dir.join("config.json").exists() {
        return false;
    }
    let Ok(entries) = fs::read_dir(dir) else { return false };
    entries.flatten().any(|e| has_ext(&e.path(), "safetensors"))
}

fn has_ext(path: &Path, ext: &str) -> bool {
    path.extension().and_then(|e| e.to_str()).map(|s| s.eq_ignore_ascii_case(ext)).unwrap_or(false)
}

fn model_from_dir(dir: &Path) -> Option<InstalledModelInfo> {
    let abs = dir.to_string_lossy().into_owned();
    let folder = dir.file_name()?.to_string_lossy().into_owned();
    let md = fs::metadata(dir).ok()?;
    let modified_at = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| format_secs(d.as_secs() as i64))
        .unwrap_or_default();
    Some(InstalledModelInfo {
        name: abs.clone(),
        size_bytes: dir_size(dir),
        modified_at,
        family: "MLX".into(),
        parameter_size: String::new(),
        quantization: read_quant_bits(dir),
        backend: BackendKind::Mlx,
        digest: String::new(),
        display_name: Some(read_repo(dir, &folder)),
        path: Some(abs),
    })
}

/// Sum of top-level file sizes in the model dir.
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

/// MLX configs carry `"quantization": { "bits": 4, ... }` → "4bit". Blank if
/// the model isn't quantized or the field is absent (never fabricated).
fn read_quant_bits(dir: &Path) -> String {
    let Ok(txt) = fs::read_to_string(dir.join("config.json")) else { return String::new() };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) else { return String::new() };
    v.get("quantization")
        .and_then(|q| q.get("bits"))
        .and_then(|b| b.as_u64())
        .map(|b| format!("{b}bit"))
        .unwrap_or_default()
}

/// The original HF repo id recorded at download time, falling back to the
/// folder name for models imported some other way.
fn read_repo(dir: &Path, fallback: &str) -> String {
    fs::read_to_string(dir.join(REPO_MARKER))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[cfg(test)]
#[path = "mlx_discover_tests.rs"]
mod tests;
