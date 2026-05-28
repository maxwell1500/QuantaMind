use crate::errors::{AppError, AppResult};
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
