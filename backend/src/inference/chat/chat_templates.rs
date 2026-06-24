use crate::inference::chat::chat_template_data::{
    ChatTemplate, COMMAND_R, DEEPSEEK, GEMMA, GPT_OSS, LLAMA3, MISTRAL, PHI3, QWEN_CHATML, YI,
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
        // gemma4's stop (`<end_of_turn>`) is the same as gemma/gemma2 — correct to route
        // here. NOTE: this fixes the STOP TOKEN only; it does NOT address the separate
        // `gemma-4-12b-it-qat_q4_0` pad-token collapse (substantive prompts emit invisible
        // tokens regardless of stops/temperature) — that's a broken-build issue, see the
        // gpt-oss-harmony-stop-tokens follow-ups.
        "gemma" | "gemma2" | "gemma4" => Some(GEMMA),
        // Harmony: stops on `<|return|>`/`<|call|>` so the model halts instead of looping.
        "gpt-oss" => Some(GPT_OSS),
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
    } else if n.contains("gpt-oss") || n.contains("gpt_oss") {
        Some(GPT_OSS)
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

#[cfg(test)]
mod tests {
    use super::detect_template;

    #[test]
    fn harmony_arch_resolves_to_call_and_return_stops_without_end() {
        // The infinite-generation fix: gpt-oss must stop on `<|return|>`/`<|call|>`.
        let t = detect_template("gpt-oss-20b_q8_0", Some("gpt-oss")).expect("gpt-oss is known");
        assert_eq!(t.stop_tokens, &["<|return|>", "<|call|>"]);
        // `<|end|>` is an inter-message separator — including it would truncate the turn
        // before the tool call, so it must NOT be a stop.
        assert!(!t.stop_tokens.contains(&"<|end|>"), "<|end|> must not be a stop token");
    }

    #[test]
    fn harmony_resolves_by_name_when_architecture_is_absent() {
        let t = detect_template("gpt-oss-20b_q8_0", None).expect("name fallback");
        assert_eq!(t.stop_tokens, &["<|return|>", "<|call|>"]);
    }

    #[test]
    fn gemma4_arch_routes_to_gemma_stop() {
        // Stop is correct; this does NOT address the qat_q4_0 pad-token collapse.
        let t = detect_template("gemma-4-12b-it-qat_q4_0", Some("gemma4")).expect("gemma4 routes to GEMMA");
        assert_eq!(t.stop_tokens, &["<end_of_turn>"]);
    }

    #[test]
    fn unknown_architecture_is_none() {
        assert!(detect_template("totally-unknown-model", Some("made-up-arch")).is_none());
    }
}
