use crate::errors::{AppError, AppResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct PromptTemplate {
    pub name: String,
    pub body: String,
}

/// Read every `*.md` template in `dir` as `(stem, contents)`, sorted by name.
pub fn read_templates(dir: &Path) -> AppResult<Vec<PromptTemplate>> {
    let mut out = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| AppError::Io(e.to_string()))?;
    for e in entries.flatten() {
        let p = e.path();
        if let Some(stem) = p.file_name().and_then(|s| s.to_str()).and_then(|n| n.strip_suffix(".md")) {
            let body = std::fs::read_to_string(&p).map_err(|e| AppError::Io(e.to_string()))?;
            out.push(PromptTemplate { name: stem.to_string(), body });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// The bundled templates dir: env override → resources (prod) → source tree (dev).
fn templates_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUANTAMIND_PROMPTS_DIR") {
        return Some(PathBuf::from(p)).filter(|d| d.is_dir());
    }
    if let Ok(res) = app.path().resource_dir() {
        let d = res.join("prompts");
        if d.is_dir() {
            return Some(d);
        }
    }
    #[cfg(debug_assertions)]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(backend) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            let d = backend.join("../docs/prompts");
            if d.is_dir() {
                return Some(d);
            }
        }
    }
    None
}

#[tauri::command]
pub fn list_prompt_templates(app: tauri::AppHandle) -> Result<Vec<PromptTemplate>, AppError> {
    match templates_dir(&app) {
        Some(dir) => read_templates(&dir),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
#[path = "templates_tests.rs"]
mod tests;
