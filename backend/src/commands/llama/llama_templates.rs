use crate::errors::AppError;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// One available llama.cpp chat-template override (`<name>.jinja`), and where it
/// came from so the UI can show user files distinctly from bundled defaults.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ChatTemplateFile {
    pub name: String,
    pub source: TemplateSource,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TemplateSource {
    User,
    Bundled,
}

/// The user-writable override dir: `app_config_dir/chat_templates`. Drop a
/// `<arch>.jinja` (or `<model>.jinja`) here to override a model's embedded
/// template at spawn; delete it to revert. Not created eagerly — absence just
/// means "no overrides".
pub fn user_templates_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("chat_templates"))
}

/// The bundled defaults dir: env override → resources (prod) → source tree (dev).
/// Mirrors `prompt_templates::templates_dir`.
pub fn bundled_templates_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUANTAMIND_CHAT_TEMPLATES_DIR") {
        return Some(PathBuf::from(p)).filter(|d| d.is_dir());
    }
    if let Ok(res) = app.path().resource_dir() {
        let d = res.join("chat_templates");
        if d.is_dir() {
            return Some(d);
        }
    }
    #[cfg(debug_assertions)]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(backend) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            let d = backend.join("../docs/chat_templates");
            if d.is_dir() {
                return Some(d);
            }
        }
    }
    None
}

/// Find a `.jinja` override file for this model, USER dir first (so a user file
/// overrides a bundled one by name). Tries the most specific key first — the
/// model name (its gguf file stem) — then the architecture, so a broken
/// family template can be fixed for every model of that arch with one file.
/// Returns `None` when nothing matches → the spawn uses the GGUF's embedded
/// template via `--jinja` (the default for every model).
pub fn resolve_template_file(app: &tauri::AppHandle, model_stem: &str, arch: &str) -> Option<PathBuf> {
    let dirs: Vec<PathBuf> = [user_templates_dir(app), bundled_templates_dir(app)].into_iter().flatten().collect();
    resolve_in_dirs(&dirs, model_stem, arch)
}

/// Pure resolution over an ordered dir list (highest priority first). Split out
/// so the match logic is unit-tested with temp dirs, no `AppHandle`.
pub fn resolve_in_dirs(dirs: &[PathBuf], model_stem: &str, arch: &str) -> Option<PathBuf> {
    for dir in dirs {
        for key in [model_stem, arch] {
            if key.is_empty() {
                continue;
            }
            let candidate = dir.join(format!("{key}.jinja"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// List every available override (`*.jinja`) across the user and bundled dirs.
/// A user file shadows a bundled one of the same name (it's what `resolve_*`
/// would pick), so it's reported once, as `User`.
pub fn list_templates(app: &tauri::AppHandle) -> Vec<ChatTemplateFile> {
    list_in_layers(&[
        (user_templates_dir(app), TemplateSource::User),
        (bundled_templates_dir(app), TemplateSource::Bundled),
    ])
}

/// Pure listing over ordered layers (highest priority first). Split out for tests.
pub fn list_in_layers(layers: &[(Option<PathBuf>, TemplateSource)]) -> Vec<ChatTemplateFile> {
    let mut seen = std::collections::BTreeMap::<String, TemplateSource>::new();
    for (dir, source) in layers {
        let Some(dir) = dir else { continue };
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for e in entries.flatten() {
            if let Some(name) = e.path().file_name().and_then(|s| s.to_str()).and_then(|n| n.strip_suffix(".jinja")) {
                // Layers are visited highest-priority first; never let a lower one shadow it.
                seen.entry(name.to_string()).or_insert(*source);
            }
        }
    }
    seen.into_iter().map(|(name, source)| ChatTemplateFile { name, source }).collect()
}

#[tauri::command]
pub fn list_chat_templates(app: tauri::AppHandle) -> Result<Vec<ChatTemplateFile>, AppError> {
    Ok(list_templates(&app))
}

/// The gguf file stem used as the model-name override key (no dir, no `.gguf`).
pub fn model_stem(gguf_path: &str) -> &str {
    Path::new(gguf_path).file_stem().and_then(|s| s.to_str()).unwrap_or("")
}

#[cfg(test)]
#[path = "llama_templates_tests.rs"]
mod tests;
