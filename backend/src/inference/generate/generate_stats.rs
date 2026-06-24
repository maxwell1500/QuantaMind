use serde::Serialize;

/// Server-reported metrics from a backend's final stream chunk, normalized to
/// milliseconds. Every field is optional: a backend reports only what it knows
/// (Ollama gives load + prompt-eval; llama.cpp gives prompt/predict timings),
/// and `None` means "not measured" — never fabricate a zero. See
/// `docs/architecture.md#robustness`.
#[derive(Default, Clone, Serialize, PartialEq, Debug)]
pub struct GenerateStats {
    pub prompt_eval_count: Option<u32>,
    pub prompt_eval_ms: Option<u64>,
    pub eval_count: Option<u32>,
    pub eval_ms: Option<u64>,
    pub load_ms: Option<u64>,
    pub total_ms: Option<u64>,
}

/// Nanoseconds → whole milliseconds (Ollama reports ns durations).
pub fn ns_to_ms(ns: u64) -> u64 {
    ns / 1_000_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ns_to_ms_truncates() {
        assert_eq!(ns_to_ms(0), 0);
        assert_eq!(ns_to_ms(1_999_999), 1);
        assert_eq!(ns_to_ms(540_000_000), 540);
    }

    #[test]
    fn default_is_all_none() {
        let s = GenerateStats::default();
        assert!(s.prompt_eval_ms.is_none() && s.load_ms.is_none());
    }
}
