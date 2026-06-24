use crate::commands::storage::storage_disk::{gguf_dir_resolved, mlx_dir_resolved};
use crate::errors::{AppError, AppResult};
use crate::inference::backend::endpoint::{init_ollama_endpoint, ollama_endpoint, update_ollama_endpoint};
use crate::persistence::user_settings::{load, save, UserSettings};
use crate::sync::MutexExt;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub const USER_SETTINGS_FILE: &str = "user_settings.yaml";

#[derive(Default)]
pub struct UserSettingsState {
    inner: Mutex<UserSettings>,
    loaded: Mutex<bool>,
}

fn settings_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join(USER_SETTINGS_FILE))
}

impl UserSettingsState {
    fn ensure_loaded(&self, app: &tauri::AppHandle) -> AppResult<()> {
        let mut loaded = self.loaded.lock_recover();
        if *loaded {
            return Ok(());
        }
        *self.inner.lock_recover() = load(&settings_path(app)?)?;
        *loaded = true;
        Ok(())
    }

    /// The resolved shared GGUF weights folder (user setting → env → default).
    pub fn weights_dir(&self, app: &tauri::AppHandle) -> AppResult<PathBuf> {
        self.ensure_loaded(app)?;
        let folder = self.inner.lock_recover().models_folder.clone();
        Ok(gguf_dir_resolved(folder.as_deref()))
    }

    /// The resolved MLX weights folder (env → `~/.quantamind/mlx`). Independent
    /// of the GGUF folder so safetensors snapshots don't co-mingle with GGUFs.
    pub fn mlx_weights_dir(&self) -> PathBuf {
        mlx_dir_resolved(None)
    }

    /// The user-set custom folder for the whisper-server STT engine, if any.
    /// `whisper_dir` consults this first so a manually-located install persists
    /// across launches.
    pub fn stt_engine_dir(&self, app: &tauri::AppHandle) -> AppResult<Option<String>> {
        self.ensure_loaded(app)?;
        Ok(self.inner.lock_recover().stt_engine_dir.clone())
    }
}

#[tauri::command]
pub fn get_user_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, UserSettingsState>,
) -> Result<UserSettings, AppError> {
    state.ensure_loaded(&app)?;
    Ok(state.inner.lock_recover().clone())
}

#[tauri::command]
pub fn set_user_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, UserSettingsState>,
    settings: UserSettings,
) -> Result<(), AppError> {
    state.ensure_loaded(&app)?;
    *state.inner.lock_recover() = settings.clone();
    save(&settings_path(&app)?, &settings)
}

/// The absolute shared GGUF weights folder, for display in the UI.
#[tauri::command]
pub fn resolve_models_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, UserSettingsState>,
) -> Result<String, AppError> {
    Ok(state.weights_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_ollama_endpoint(
    app: tauri::AppHandle,
    state: tauri::State<'_, UserSettingsState>,
) -> Result<String, AppError> {
    state.ensure_loaded(&app)?;
    Ok(state.inner.lock_recover().ollama_endpoint.clone().unwrap_or_default())
}

#[tauri::command]
pub fn set_ollama_endpoint(
    app: tauri::AppHandle,
    state: tauri::State<'_, UserSettingsState>,
    endpoint: String,
) -> Result<(), AppError> {
    state.ensure_loaded(&app)?;
    let trimmed = endpoint.trim().to_string();
    let mut settings = state.inner.lock_recover().clone();
    settings.ollama_endpoint = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
    save(&settings_path(&app)?, &settings)?;
    *state.inner.lock_recover() = settings;
    update_ollama_endpoint(&trimmed);
    Ok(())
}

pub fn init_endpoint_from_settings(app: &tauri::AppHandle, state: &UserSettingsState) {
    let _ = state.ensure_loaded(app);
    let configured = state.inner.lock_recover().ollama_endpoint.clone();
    init_ollama_endpoint(configured.as_deref());
}
