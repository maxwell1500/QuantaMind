use crate::commands::workspace::workspaces::WorkspaceState;
use crate::errors::{AppError, AppResult};
use crate::persistence::prompts::history::{self, History, HistoryEntry};
use crate::persistence::prompts::schema::InferenceParams;
use crate::time_iso::now_utc;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct AppendArgs {
    #[serde(default)]
    pub name: String,
    pub prompt_path: Option<String>,
    pub model: String,
    #[serde(default)]
    pub system: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub params: InferenceParams,
    pub output: String,
    pub token_count: u32,
}

fn qdir(state: &WorkspaceState) -> AppResult<PathBuf> {
    Ok(state.root()?.join(".quantamind"))
}
fn runs_dir(q: &Path) -> PathBuf { q.join("runs") }
fn history_path(q: &Path) -> PathBuf { q.join("history.yaml") }

#[tauri::command]
pub fn history_append(
    state: tauri::State<'_, WorkspaceState>,
    entry: AppendArgs,
) -> Result<(), AppError> {
    let q = qdir(&state)?;
    let runs = runs_dir(&q);
    std::fs::create_dir_all(&runs).map_err(|e| AppError::Io(e.to_string()))?;
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(runs.join(format!("{id}.txt")), &entry.output)
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut h = history::load(&history_path(&q))?;
    let rec = HistoryEntry {
        id, name: entry.name, prompt_path: entry.prompt_path, model: entry.model,
        system: entry.system, user: entry.user, params: entry.params,
        output_preview: history::preview(&entry.output),
        output_len: entry.output.chars().count(),
        token_count: entry.token_count, ran_at: now_utc(),
    };
    let evicted = history::record(&mut h, rec);
    history::save(&history_path(&q), &h)?;
    for e in evicted {
        let _ = std::fs::remove_file(runs.join(format!("{}.txt", e.id)));
    }
    Ok(())
}

#[tauri::command]
pub fn history_list(state: tauri::State<'_, WorkspaceState>) -> Result<Vec<HistoryEntry>, AppError> {
    let q = qdir(&state)?;
    Ok(history::load(&history_path(&q))?.entries)
}

#[tauri::command]
pub fn history_get(state: tauri::State<'_, WorkspaceState>, id: String) -> Result<String, AppError> {
    let blob = runs_dir(&qdir(&state)?).join(format!("{id}.txt"));
    std::fs::read_to_string(&blob).map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn history_clear(state: tauri::State<'_, WorkspaceState>) -> Result<(), AppError> {
    let q = qdir(&state)?;
    history::save(&history_path(&q), &History::default())?;
    let _ = std::fs::remove_dir_all(runs_dir(&q));
    Ok(())
}

#[tauri::command]
pub fn history_remove_by_path(
    state: tauri::State<'_, WorkspaceState>,
    path: String,
) -> Result<(), AppError> {
    let q = qdir(&state)?;
    let mut h = history::load(&history_path(&q))?;
    let removed = history::remove_by_path(&mut h, &path);
    history::save(&history_path(&q), &h)?;
    let runs = runs_dir(&q);
    for e in removed {
        let _ = std::fs::remove_file(runs.join(format!("{}.txt", e.id)));
    }
    Ok(())
}
