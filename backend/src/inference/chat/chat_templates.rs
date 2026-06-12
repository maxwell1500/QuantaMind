use crate::inference::chat::chat_template_data::{
    ChatTemplate, COMMAND_R, DEEPSEEK, GEMMA, LLAMA3, MISTRAL, PHI3, QWEN_CHATML, YI,
};

/// Detect a chat template by (preferred) GGUF architecture string then
/// fall back to a name substring match. Returns None for unknown families
/// — the caller should surface a warning so the user knows the install
/// may produce broken outputs.
pub fn detect_template(model_name: &str, architecture: Option<&str>) -> Option<ChatTemplate> {
    if let Some(arch) = architecture {
        if let Some(t) = by_architecture(arch) {
            return Some(t);
        }
    }
    by_name(model_name)
}

fn by_architecture(arch: &str) -> Option<ChatTemplate> {
    match arch {
        "llama" => Some(LLAMA3),
        "qwen" | "qwen2" | "qwen3" => Some(QWEN_CHATML),
        "mistral" | "mixtral" => Some(MISTRAL),
        "phi3" => Some(PHI3),
        "gemma" | "gemma2" => Some(GEMMA),
        "command-r" => Some(COMMAND_R),
        "deepseek" | "deepseek2" => Some(DEEPSEEK),
        "yi" => Some(YI),
        _ => None,
    }
}

fn by_name(name: &str) -> Option<ChatTemplate> {
    let n = name.to_lowercase();
    if n.contains("llama-3") || n.contains("llama3") {
        Some(LLAMA3)
    } else if n.contains("qwen") {
        Some(QWEN_CHATML)
    } else if n.contains("mistral") || n.contains("mixtral") {
        Some(MISTRAL)
    } else if n.contains("phi-3") || n.contains("phi3") {
        Some(PHI3)
    } else if n.contains("gemma") {
        Some(GEMMA)
    } else if n.contains("command-r") || n.contains("commandr") || n.contains("c4ai") {
        Some(COMMAND_R)
    } else if n.contains("deepseek") {
        Some(DEEPSEEK)
    } else if n.starts_with("yi-") || n.starts_with("yi:") || n.starts_with("yi/") {
        Some(YI)
    } else {
        None
    }
}
