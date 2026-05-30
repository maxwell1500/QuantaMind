use serde::Serialize;

/// One streamed token's timing: its text, milliseconds since run start
/// (`t_ms`, derived from a monotonic `Instant`), and 1-based cumulative
/// count (`n`). Terse keys keep the per-run array small for long outputs.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TokenTiming {
    pub text: String,
    pub t_ms: u64,
    pub n: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_with_exact_keys() {
        let entry = TokenTiming { text: "hi".into(), t_ms: 42, n: 1 };
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["text"], "hi");
        assert_eq!(json["t_ms"], 42);
        assert_eq!(json["n"], 1);
        let obj = json.as_object().unwrap();
        assert_eq!(obj.len(), 3, "unexpected fields: {obj:?}");
    }
}
