use crate::errors::{AppError, AppResult};
use crate::persistence::prompts::io;
use crate::persistence::prompts::schema::{InferenceParams, PromptFile};
use crate::time_iso::now_utc;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn welcome_prompt(now: String) -> PromptFile {
    PromptFile {
        name: "welcome".into(),
        system: "You are a friendly poet.".into(),
        user: "Write a playful two-line poem about running AI locally on my own machine.".into(),
        model: None,
        params: InferenceParams::default(),
        created_at: now.clone(),
        updated_at: now,
        auto_rerun: false,
    }
}

/// Create the workspace folder (if needed) and seed a welcome prompt that
/// shows off streaming. Idempotent: never overwrites an existing welcome.
pub fn scaffold_in(root: &Path) -> AppResult<PathBuf> {
    std::fs::create_dir_all(root).map_err(|e| AppError::Io(e.to_string()))?;
    let welcome = root.join("welcome.quantamind.yaml");
    if !welcome.exists() {
        io::write(&welcome, &welcome_prompt(now_utc()))?;
    }
    Ok(welcome)
}

#[tauri::command]
pub fn scaffold_onboarding_workspace(app: tauri::AppHandle) -> Result<String, AppError> {
    let docs = app.path().document_dir().map_err(|e| AppError::Io(e.to_string()))?;
    let root = docs.join("QuantaMind");
    scaffold_in(&root)?;
    Ok(root.display().to_string())
}

#[cfg(test)]
#[path = "onboarding_tests.rs"]
mod tests;
