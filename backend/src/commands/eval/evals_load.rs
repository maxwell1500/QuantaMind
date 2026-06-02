use crate::errors::{AppError, AppResult};
use crate::inference::eval::eval_task::EvalTask;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Read every `*.yaml` eval task in `dir`, sorted by id. A malformed file fails
/// the whole load (better a loud error than a silently-missing eval).
pub fn read_evals(dir: &Path) -> AppResult<Vec<EvalTask>> {
    let mut out = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| AppError::Io(e.to_string()))?;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) == Some("yaml") {
            let raw = std::fs::read_to_string(&p).map_err(|e| AppError::Io(e.to_string()))?;
            let task: EvalTask =
                serde_yaml::from_str(&raw).map_err(|e| AppError::Internal(format!("{}: {e}", p.display())))?;
            out.push(task);
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// The bundled evals dir: env override → resources (prod) → source tree (dev).
fn evals_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUANTAMIND_EVALS_DIR") {
        return Some(PathBuf::from(p)).filter(|d| d.is_dir());
    }
    if let Ok(res) = app.path().resource_dir() {
        let d = res.join("evals");
        if d.is_dir() {
            return Some(d);
        }
    }
    #[cfg(debug_assertions)]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(backend) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            let d = backend.join("../docs/evals");
            if d.is_dir() {
                return Some(d);
            }
        }
    }
    None
}

#[tauri::command]
pub fn list_evals(app: tauri::AppHandle) -> Result<Vec<EvalTask>, AppError> {
    match evals_dir(&app) {
        Some(dir) => read_evals(&dir),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
#[path = "evals_load_tests.rs"]
mod tests;
