use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Map an arbitrary id to a collision-proof, path-safe file stem. A long nested
/// id (e.g. "company-evals-qwen3-coder-agentic-v1-test-suite") neither overflows
/// path limits nor truncates into a colliding stem: a ≤40-char human-readable
/// slug is suffixed with an 8-hex hash of the FULL original id, so any two
/// distinct ids — even ones sharing a 40-char prefix — get distinct stems.
///
/// Deliberately NOT a replacement for `evals::sanitize_name`: changing that would
/// re-key (and orphan) every already-saved collection/history file. This is only
/// for the new readiness stores.
pub fn safe_filename(id: &str) -> String {
    let slug: String = id
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let prefix = slug.chars().take(40).collect::<String>();
    let prefix = prefix.trim_matches('-');
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    format!("{}-{:08x}", prefix, hasher.finish() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_shared_prefix_ids_get_distinct_bounded_stems() {
        let base = "company-evals-qwen3-coder-agentic-v1-test-suite";
        let a = safe_filename(&format!("{base}-AAAA"));
        let b = safe_filename(&format!("{base}-BBBB"));
        assert_ne!(a, b, "distinct ids must not collide even past 40 chars");
        assert!(a.len() <= 49, "stem must stay bounded (40 slug + '-' + 8 hex): {a}");
    }

    #[test]
    fn same_id_is_deterministic() {
        assert_eq!(safe_filename("coding-agent"), safe_filename("coding-agent"));
    }

    #[test]
    fn distinct_short_ids_differ() {
        assert_ne!(safe_filename("coding-agent"), safe_filename("rag-assistant"));
    }
}
