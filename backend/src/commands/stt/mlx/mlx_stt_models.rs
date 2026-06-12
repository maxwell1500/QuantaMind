use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::mlx::mlx_install::REPO_MARKER;
use crate::commands::storage::storage_disk::{mlx_model_dir, mlx_stt_dir};
use crate::errors::AppError;
use crate::inference::stt::stt_mlx_catalog::{catalog, find, MlxSttCatalogEntry};
use serde::Serialize;
use std::fs;
use std::path::Path;

/// An installed MLX whisper snapshot (a downloaded `mlx-community/whisper-*` dir).
#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct InstalledMlxSttModel {
    pub repo: String,
    pub display: String,
    pub path: String,
    pub size_bytes: u64,
}

/// A snapshot under this size is treated as partial/empty (not "installed").
const MIN_SNAPSHOT_BYTES: u64 = 1024 * 1024;

fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}

/// Installed MLX whisper snapshots in `dir`: each subdir carrying the `.qm-repo`
/// marker with a real (non-partial) size. Pure over `dir` for testability.
fn installed_in(dir: &Path) -> Vec<InstalledMlxSttModel> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(dir) else { return out };
    for entry in rd.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let Ok(repo) = fs::read_to_string(p.join(REPO_MARKER)) else { continue };
        let repo = repo.trim().to_string();
        let size_bytes = dir_size(&p);
        if size_bytes < MIN_SNAPSHOT_BYTES {
            continue;
        }
        let display = find(&repo).map(|e| e.display.to_string()).unwrap_or_else(|| repo.clone());
        out.push(InstalledMlxSttModel {
            repo,
            display,
            path: p.to_string_lossy().into_owned(),
            size_bytes,
        });
    }
    out.sort_by(|a, b| a.repo.cmp(&b.repo));
    out
}

/// The curated MLX STT catalog (pre-download disclosure).
#[tauri::command]
pub fn list_mlx_stt_catalog() -> Vec<MlxSttCatalogEntry> {
    catalog().to_vec()
}

/// Installed MLX whisper models, for the catalog's "installed" state.
#[tauri::command]
pub fn list_installed_mlx_stt_models() -> Vec<InstalledMlxSttModel> {
    installed_in(&mlx_stt_dir())
}

/// Delete an installed MLX whisper snapshot (its whole repo dir).
#[tauri::command]
pub fn delete_mlx_stt_model(app: tauri::AppHandle, repo: String) -> Result<(), AppError> {
    let model_dir = mlx_model_dir(&mlx_stt_dir(), &repo);
    if model_dir.exists() {
        fs::remove_dir_all(&model_dir).map_err(|e| AppError::Io(e.to_string()))?;
    }
    log_emit(&app, EVENT_MODELS_CHANGED, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_only_marked_dirs_with_a_real_size() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        // A real snapshot: marker + a >1 MiB weights file.
        let real = p.join("mlx-community_whisper-tiny");
        fs::create_dir_all(&real).unwrap();
        fs::write(real.join(REPO_MARKER), "mlx-community/whisper-tiny").unwrap();
        fs::write(real.join("weights.safetensors"), vec![0u8; 2 * 1024 * 1024]).unwrap();
        // No marker → ignored.
        let junk = p.join("junk");
        fs::create_dir_all(&junk).unwrap();
        fs::write(junk.join("x"), b"x").unwrap();
        // Marked but tiny (partial) → ignored.
        let partial = p.join("partial");
        fs::create_dir_all(&partial).unwrap();
        fs::write(partial.join(REPO_MARKER), "mlx-community/whisper-base-mlx").unwrap();

        let got = installed_in(p);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].repo, "mlx-community/whisper-tiny");
        assert_eq!(got[0].display, "Tiny (multilingual)", "catalog display used");
        assert!(got[0].size_bytes >= 2 * 1024 * 1024);
    }
}
