use crate::commands::workspaces::WorkspaceState;
use crate::errors::{AppError, AppResult};
use crate::persistence::prompts::{io as p_io, schema::PromptFile, tree, tree::TreeNode};
use crate::time_iso::now_utc;
use std::path::PathBuf;

const EXT_SUFFIX: &str = ".quantamind.yaml";

fn validated(state: &WorkspaceState, path: &str) -> AppResult<PathBuf> {
    state.ensure_within(&PathBuf::from(path))
}

#[tauri::command]
pub fn load_prompt(
    state: tauri::State<'_, WorkspaceState>,
    path: String,
) -> Result<PromptFile, AppError> {
    p_io::read(&validated(&state, &path)?)
}

#[tauri::command]
pub fn save_prompt(
    state: tauri::State<'_, WorkspaceState>,
    path: String,
    file: PromptFile,
) -> Result<PromptFile, AppError> {
    let target = validated(&state, &path)?;
    let mut updated = file;
    updated.updated_at = now_utc();
    p_io::write(&target, &updated)?;
    Ok(updated)
}

#[tauri::command]
pub fn create_prompt(
    state: tauri::State<'_, WorkspaceState>,
    parent: String,
    name: String,
) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("name is empty".into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(AppError::Validation("name cannot contain path separators".into()));
    }
    let probe = state.ensure_within(&PathBuf::from(&parent).join("_"))?;
    let parent_abs = probe
        .parent()
        .ok_or_else(|| AppError::Internal("resolved parent path has no parent".into()))?
        .to_path_buf();
    let target = parent_abs.join(format!("{}{}", trimmed, EXT_SUFFIX));
    if target.exists() {
        return Err(AppError::Validation(format!("already exists: {}", target.display())));
    }
    let now = now_utc();
    let pf = PromptFile {
        name: trimmed.into(),
        system: String::new(), user: String::new(), model: None,
        params: Default::default(),
        created_at: now.clone(), updated_at: now, auto_rerun: false,
    };
    p_io::write(&target, &pf)?;
    Ok(target.display().to_string())
}

#[tauri::command]
pub fn rename_path(
    state: tauri::State<'_, WorkspaceState>,
    old: String, new: String,
) -> Result<(), AppError> {
    let old_abs = validated(&state, &old)?;
    let new_abs = state.resolve_new(&PathBuf::from(&new))?;
    p_io::rename(&old_abs, &new_abs)
}

#[tauri::command]
pub fn delete_path(
    state: tauri::State<'_, WorkspaceState>,
    path: String,
) -> Result<Vec<TreeNode>, AppError> {
    let abs = validated(&state, &path)?;
    p_io::delete(&abs)?;
    tree::list(&state.root()?)
}
