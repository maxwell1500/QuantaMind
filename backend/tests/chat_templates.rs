use quantamind_lib::inference::chat_template_data::{
    ChatTemplate, COMMAND_R, DEEPSEEK, GEMMA, LLAMA3, MISTRAL, PHI3, QWEN_CHATML, YI,
};
use quantamind_lib::inference::chat_templates::detect_template;

const ALL: &[ChatTemplate] = &[LLAMA3, QWEN_CHATML, MISTRAL, PHI3, GEMMA, COMMAND_R, DEEPSEEK, YI];

#[test]
fn architecture_dispatches_for_all_known_families() {
    let cases = [
        ("llama", LLAMA3),
        ("qwen2", QWEN_CHATML), ("qwen3", QWEN_CHATML),
        ("mistral", MISTRAL), ("mixtral", MISTRAL),
        ("phi3", PHI3),
        ("gemma", GEMMA), ("gemma2", GEMMA),
        ("command-r", COMMAND_R),
        ("deepseek", DEEPSEEK), ("deepseek2", DEEPSEEK),
        ("yi", YI),
    ];
    for (arch, expected) in cases {
        assert_eq!(detect_template("x", Some(arch)), Some(expected), "arch={arch}");
    }
}

#[test]
fn name_variants_resolve_to_correct_family_for_each_of_eight_families() {
    let cases: &[(ChatTemplate, &[&str])] = &[
        (LLAMA3, &["llama3.2:1b", "llama-3.1-8b-instruct", "meta-llama-3-70b", "Meta-Llama-3.3-8B"]),
        (QWEN_CHATML, &["qwen2.5:7b", "Qwen2.5-Coder-7B-Instruct", "qwen3:4b"]),
        (MISTRAL, &["mistral:7b", "Mistral-Small-3-24B", "mixtral:8x7b"]),
        (PHI3, &["phi3:mini", "phi3.5:latest", "Phi-3-medium-128k"]),
        (GEMMA, &["gemma2:9b", "gemma-2b", "codegemma:7b"]),
        (COMMAND_R, &["command-r:35b", "commandr-plus", "c4ai-command-r-v01"]),
        (DEEPSEEK, &["deepseek-coder:6.7b", "DeepSeek-V2", "deepseek-llm:67b"]),
        (YI, &["yi:9b", "yi-34b", "yi:chat-6b"]),
    ];
    for (expected, names) in cases {
        for name in *names {
            assert_eq!(detect_template(name, None), Some(*expected), "name={name}");
        }
    }
}

#[test]
fn unknown_family_returns_none() {
    for n in ["bert-base", "stablelm", "random-name", "totally-unknown-model"] {
        assert_eq!(detect_template(n, None), None, "name={n}");
        assert_eq!(detect_template(n, Some("alien-arch")), None, "name={n}");
    }
}

#[test]
fn architecture_wins_over_conflicting_name() {
    assert_eq!(detect_template("mistral-7b", Some("phi3")), Some(PHI3));
}

#[test]
fn template_strings_roundtrip_through_json() {
    for t in ALL {
        let json = serde_json::to_string(t.template_string).expect("to_string");
        let parsed: String = serde_json::from_str(&json).expect("from_str");
        assert_eq!(parsed, t.template_string, "family={}", t.family);
    }
}

#[test]
fn every_template_carries_required_placeholders_and_stops() {
    for t in ALL {
        assert!(t.template_string.contains("{{ .Prompt }}"), "{} missing .Prompt", t.family);
        assert!(t.template_string.contains("{{ .Response }}"), "{} missing .Response", t.family);
        assert!(!t.stop_tokens.is_empty(), "{} has no stop tokens", t.family);
    }
}
