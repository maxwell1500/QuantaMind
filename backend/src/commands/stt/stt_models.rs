use crate::commands::emit::log_emit;
use crate::commands::gguf::gguf_cmd::EVENT_MODELS_CHANGED;
use crate::commands::stt::stt_disk::{stt_dir, vad_dest, whisper_dest};
use crate::errors::AppError;
use crate::inference::stt::stt_catalog::{catalog, VAD_FILE};
use crate::inference::stt::stt_format::{validate_stt_model, SttModelKind};
use serde::Serialize;
use std::path::Path;

/// A catalog model that is fully installed and usable: its whisper ggml file
/// and the shared silero VAD both validate. Carries resolved paths so the UI
/// can start the server without re-resolving anything.
#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct InstalledSttModel {
    pub id: String,
    pub display: String,
    pub model_path: String,
    pub vad_path: String,
    pub size_bytes: u64,
}

/// Installed-and-usable models in `dir`. A model counts only when its ggml
/// validates AND the shared VAD validates — without the VAD nothing is usable
/// (it gates the silence metric), so the whole list is empty. Pure over `dir`
/// for testability.
fn installed_in(dir: &Path) -> Vec<InstalledSttModel> {
    let vad = vad_dest(dir, VAD_FILE);
    if validate_stt_model(&vad, SttModelKind::Vad).is_err() {
        return Vec::new();
    }
    let vad_path = vad.to_string_lossy().into_owned();
    catalog()
        .iter()
        .filter_map(|e| {
            let model = whisper_dest(dir, e.id);
            if validate_stt_model(&model, SttModelKind::Whisper).is_err() {
                return None;
            }
            let size_bytes = std::fs::metadata(&model).map(|m| m.len()).unwrap_or(0);
            Some(InstalledSttModel {
                id: e.id.to_string(),
                display: e.display.to_string(),
                model_path: model.to_string_lossy().into_owned(),
                vad_path: vad_path.clone(),
                size_bytes,
            })
        })
        .collect()
}

/// The installed STT models, for the catalog's "installed" state and to feed
/// `start_whisper_server(model_path, vad_path)`.
#[tauri::command]
pub fn list_installed_stt_models() -> Vec<InstalledSttModel> {
    installed_in(&stt_dir())
}

/// Remove a model's whisper `.bin` from `dir`. The shared VAD is left in place —
/// other models rely on it. Missing file is a no-op.
fn delete_in(dir: &Path, id: &str) -> std::io::Result<()> {
    let path = whisper_dest(dir, id);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

/// Delete an installed STT model (its whisper `.bin`), keeping the shared VAD.
#[tauri::command]
pub fn delete_stt_model(app: tauri::AppHandle, id: String) -> Result<(), AppError> {
    delete_in(&stt_dir(), &id).map_err(|e| AppError::Io(e.to_string()))?;
    log_emit(&app, EVENT_MODELS_CHANGED, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const GGML: [u8; 4] = [0x6c, 0x6d, 0x67, 0x67];

    fn ggml(total: usize) -> Vec<u8> {
        let mut b = GGML.to_vec();
        b.resize(total, 0);
        b
    }

    #[test]
    fn lists_a_model_only_when_both_it_and_the_vad_validate() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        // A model present but no VAD → nothing usable.
        std::fs::write(whisper_dest(p, "tiny.en"), ggml(1024 * 1024 + 16)).unwrap();
        assert!(installed_in(p).is_empty(), "no VAD → nothing usable");

        // Add the VAD → the model becomes installed, with resolved paths.
        std::fs::write(vad_dest(p, VAD_FILE), ggml(300 * 1024)).unwrap();
        let got = installed_in(p);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "tiny.en");
        assert!(got[0].model_path.ends_with("ggml-tiny.en.bin"), "{}", got[0].model_path);
        assert!(got[0].vad_path.ends_with(VAD_FILE), "{}", got[0].vad_path);
        assert!(got[0].size_bytes > 1024 * 1024);
    }

    #[test]
    fn a_truncated_model_is_not_listed() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        std::fs::write(vad_dest(p, VAD_FILE), ggml(300 * 1024)).unwrap();
        std::fs::write(whisper_dest(p, "tiny.en"), ggml(4096)).unwrap(); // below the floor
        assert!(installed_in(p).is_empty(), "an invalid/truncated model is excluded");
    }

    #[test]
    fn delete_removes_the_model_bin_but_keeps_the_vad() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        let model = whisper_dest(p, "tiny.en");
        let vad = vad_dest(p, VAD_FILE);
        std::fs::write(&model, ggml(1024 * 1024 + 16)).unwrap();
        std::fs::write(&vad, ggml(300 * 1024)).unwrap();

        delete_in(p, "tiny.en").unwrap();
        assert!(!model.exists(), "the whisper .bin is removed");
        assert!(vad.exists(), "the shared VAD is kept");
        // Deleting a missing model is a no-op.
        delete_in(p, "tiny.en").unwrap();
    }
}
