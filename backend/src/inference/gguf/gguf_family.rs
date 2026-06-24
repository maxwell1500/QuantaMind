/// Map a GGUF architecture string (e.g. "llama", "qwen2") to a human
/// display name. Unknown architectures pass through capitalized.
pub fn family_from_architecture(arch: &str) -> String {
    match arch {
        "llama" => "Llama".into(),
        "qwen" => "Qwen".into(),
        "qwen2" => "Qwen 2".into(),
        "qwen3" => "Qwen 3".into(),
        "mistral" => "Mistral".into(),
        "phi3" => "Phi-3".into(),
        "phi2" => "Phi-2".into(),
        "gemma" => "Gemma".into(),
        "gemma2" => "Gemma 2".into(),
        "command-r" => "Command-R".into(),
        "deepseek" => "DeepSeek".into(),
        "deepseek2" => "DeepSeek 2".into(),
        "yi" => "Yi".into(),
        "starcoder" | "starcoder2" => "StarCoder".into(),
        "" => String::new(),
        other => {
            let mut c = other.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        }
    }
}
