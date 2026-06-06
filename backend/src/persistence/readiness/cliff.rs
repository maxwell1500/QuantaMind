use crate::errors::{AppError, AppResult};
use crate::persistence::readiness::safe_filename::safe_filename;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Many models × a small integer each — a generous guard against a corrupt giant file.
pub const MAX_BYTES: u64 = 256 * 1024;

/// The cliff file for a collection. `safe_filename` sanitizes ONLY the file name;
/// the model keys inside the map are stored verbatim (Ollama names carry colons).
fn cliff_path(dir: &Path, collection_id: &str) -> PathBuf {
    dir.join(format!("{}.json", safe_filename(collection_id)))
}

/// The per-model measured context-cliff depths for a collection — `{ model:
/// cliff_tokens }`. Empty map when none saved (a missing file is not an error).
/// Keys are the RAW model name (colons intact), matched verbatim by the frontend.
pub fn load(dir: &Path, collection_id: &str) -> AppResult<HashMap<String, u32>> {
    let path = cliff_path(dir, collection_id);
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let len = std::fs::metadata(&path)?.len();
    if len > MAX_BYTES {
        return Err(AppError::Validation(format!("cliff file too large ({len} bytes > {MAX_BYTES} cap)")));
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(&path)?)?)
}

/// Record one model's measured cliff depth for a collection (last-write-wins per
/// model). **Atomic**: load → merge → write a temp file → `rename` over the target.
/// A crash mid-write can only leave the inert `.tmp`; the live `.json` is always
/// 100% old or 100% new, never a half-written file that would wipe the whole
/// collection's history. (A stale `.tmp` self-heals — the next save overwrites it.)
pub fn save(dir: &Path, collection_id: &str, model: &str, cliff_tokens: u32) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let mut map = load(dir, collection_id)?;
    map.insert(model.to_string(), cliff_tokens); // verbatim model key
    let json = serde_json::to_string_pretty(&map)?;
    let final_path = cliff_path(dir, collection_id);
    let tmp_path = final_path.with_extension("json.tmp");
    std::fs::write(&tmp_path, json)?;
    std::fs::rename(&tmp_path, &final_path)?; // OS-atomic swap
    Ok(())
}

#[cfg(test)]
#[path = "cliff_tests.rs"]
mod tests;
