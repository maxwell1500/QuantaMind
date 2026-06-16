use serde::{Deserialize, Serialize};

/// License-clean synthetic padding presets, embedded at build time. Each is benign
/// filler in a distinct register (prose / structured logs / tabular CSV) so the
/// cliff probe stresses the model the way real RAG context does, without shipping
/// any third-party text. User-supplied files are the other source (`CliffSource::Text`).
const CORPORATE_POLICY: &str = include_str!("corporate_policy.txt");
const SYSTEM_LOGS: &str = include_str!("system_logs.txt");
const FINANCIAL_LEDGER: &str = include_str!("financial_ledger.txt");

/// Which embedded preset to pad with. Serialized as the snake_case tag the
/// frontend sends, so the command layer maps a string straight to a variant.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CliffPreset {
    CorporatePolicy,
    SystemLogs,
    FinancialLedger,
}

impl CliffPreset {
    /// The embedded source text for this preset (always non-empty).
    pub fn text(self) -> &'static str {
        match self {
            CliffPreset::CorporatePolicy => CORPORATE_POLICY,
            CliffPreset::SystemLogs => SYSTEM_LOGS,
            CliffPreset::FinancialLedger => FINANCIAL_LEDGER,
        }
    }
}

/// Where padding comes from: one of the embedded presets, or the user's own text
/// (the command reads + size-caps the file in the Tauri layer; the engine only ever
/// sees already-decoded UTF-8, never a path or raw bytes).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CliffSource {
    Preset { preset: CliffPreset },
    Text { text: String },
}

impl CliffSource {
    /// The source text to cycle for padding. `&str` — already valid UTF-8, decoded
    /// exactly once (presets at build time, user files in the command layer).
    pub fn text(&self) -> &str {
        match self {
            CliffSource::Preset { preset } => preset.text(),
            CliffSource::Text { text } => text,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_preset_is_non_empty_and_distinct() {
        let texts = [
            CliffPreset::CorporatePolicy.text(),
            CliffPreset::SystemLogs.text(),
            CliffPreset::FinancialLedger.text(),
        ];
        for t in texts {
            assert!(t.len() > 200, "preset filler should be substantial");
        }
        assert_ne!(texts[0], texts[1]);
        assert_ne!(texts[1], texts[2]);
    }

    #[test]
    fn source_text_routes_to_the_right_string() {
        let s = CliffSource::Preset { preset: CliffPreset::SystemLogs };
        assert_eq!(s.text(), CliffPreset::SystemLogs.text());
        let s = CliffSource::Text { text: "abc".into() };
        assert_eq!(s.text(), "abc");
    }
}
