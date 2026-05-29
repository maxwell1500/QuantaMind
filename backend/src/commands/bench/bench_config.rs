use crate::commands::workspace::workspaces::WorkspaceState;
use crate::errors::{AppError, AppResult};
use crate::persistence::bench::{io, schema::BenchConfig};
use crate::time_iso::now_utc;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct BenchEntry {
    pub name: String,
    pub path: String,
}

fn validate_name(name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::Validation("name is empty".into()));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(AppError::Validation("name cannot contain path separators".into()));
    }
    Ok(())
}

/// Save the current Bench setup as `<name>.bench.yaml` in the open workspace.
#[tauri::command]
pub fn save_bench_config(
    state: tauri::State<'_, WorkspaceState>,
    name: String,
    config: BenchConfig,
) -> Result<BenchConfig, AppError> {
    let trimmed = name.trim();
    validate_name(trimmed)?;
    let root = state.root()?;
    let target = state.ensure_within(&root.join(format!("{trimmed}{}", io::SUFFIX)))?;
    let mut c = config;
    c.name = trimmed.into();
    if c.created_at.is_empty() {
        c.created_at = now_utc();
    }
    c.updated_at = now_utc();
    io::write(&target, &c)?;
    Ok(c)
}

#[tauri::command]
pub fn load_bench_config(
    state: tauri::State<'_, WorkspaceState>,
    path: String,
) -> Result<BenchConfig, AppError> {
    io::read(&state.ensure_within(&PathBuf::from(path))?)
}

#[tauri::command]
pub fn list_bench_configs(
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Vec<BenchEntry>, AppError> {
    Ok(io::list(&state.root()?)?
        .into_iter()
        .map(|(name, path)| BenchEntry { name, path: path.display().to_string() })
        .collect())
}
