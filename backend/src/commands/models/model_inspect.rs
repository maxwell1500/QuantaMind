use crate::errors::AppError;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::ollama::ollama_show::show_model;
use serde::Serialize;

/// Model metadata for the inspector / template guard. `available` is false for
/// non-Ollama backends (the data comes from Ollama's `/api/show`); the frontend
/// then shows "Not available — Ollama only" instead of a fabricated value.
#[derive(Serialize, Default, Clone, Debug, PartialEq)]
pub struct ModelInspect {
    pub available: bool,
    pub note: Option<String>,
    pub template: String,
    pub capabilities: Vec<String>,
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
    pub is_base_guess: bool,
    pub base_reason: Option<String>,
}

fn has_role_markers(template: &str) -> bool {
    let l = template.to_lowercase();
    ["assistant", "<|im_start", "[inst]", "<|start_header_id", "<|user", "### instruction", "<start_of_turn>"]
        .iter()
        .any(|m| l.contains(m))
}

/// Advisory base-vs-instruct guess from the chat template + capabilities. A
/// `tools` capability or chat-role markers ⇒ instruct. Otherwise likely a base
/// (text-completion) model. Evidence is returned so the UI states *why*, never
/// an absolute claim.
pub fn classify_base(template: &str, capabilities: &[String]) -> (bool, Option<String>) {
    let has_tools = capabilities.iter().any(|c| c == "tools");
    if has_tools || has_role_markers(template) {
        return (false, None);
    }
    let first = if template.trim().is_empty() {
        "empty chat template"
    } else {
        "no chat-role markers in template"
    };
    (true, Some(format!("{first}; no 'tools' capability")))
}

/// Inspect an installed model (Ollama `/api/show`): chat template, capabilities,
/// and an advisory base-model guess. Non-Ollama backends return `available:
/// false` — the template/capabilities live in Ollama's metadata only.
#[tauri::command]
pub async fn inspect_model(
    model: String,
    backend: Option<BackendKind>,
) -> Result<ModelInspect, AppError> {
    if !matches!(backend.unwrap_or_default(), BackendKind::Ollama) {
        return Ok(ModelInspect {
            available: false,
            note: Some("Not available — Ollama only".into()),
            ..Default::default()
        });
    }
    let r = show_model(endpoint::OLLAMA, &model).await?;
    let (is_base_guess, base_reason) = classify_base(&r.template, &r.capabilities);
    Ok(ModelInspect {
        available: true,
        note: None,
        template: r.template,
        capabilities: r.capabilities,
        family: r.details.family,
        parameter_size: r.details.parameter_size,
        quantization: r.details.quantization_level,
        is_base_guess,
        base_reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instruct_template_is_not_base() {
        let (base, _) = classify_base("<|start_header_id|>assistant<|end_header_id|>", &["completion".into()]);
        assert!(!base);
    }

    #[test]
    fn tools_capability_alone_is_not_base() {
        let (base, _) = classify_base("", &["completion".into(), "tools".into()]);
        assert!(!base);
    }

    #[test]
    fn bare_template_no_tools_is_base_with_reason() {
        let (base, why) = classify_base("{{ .Prompt }}", &["completion".into()]);
        assert!(base);
        assert!(why.unwrap().contains("no 'tools' capability"));
    }

    #[test]
    fn empty_template_reports_empty_reason() {
        let (base, why) = classify_base("", &["completion".into()]);
        assert!(base);
        assert!(why.unwrap().contains("empty chat template"));
    }
}
