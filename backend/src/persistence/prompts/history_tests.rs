use super::*;
use tempfile::tempdir;

fn entry(id: &str) -> HistoryEntry {
    HistoryEntry {
        id: id.into(), name: format!("name-{id}"),
        prompt_path: Some("/ws/a.quantamind.yaml".into()),
        model: "llama3".into(), system: "".into(), user: "hi".into(),
        params: InferenceParams::default(), output_preview: "out".into(),
        output_len: 3, token_count: 1, ran_at: "t".into(),
    }
}

fn entry_at(id: &str, path: &str) -> HistoryEntry {
    HistoryEntry { prompt_path: Some(path.into()), ..entry(id) }
}

#[test]
fn load_missing_returns_empty() {
    let dir = tempdir().unwrap();
    assert_eq!(load(&dir.path().join("nope.yaml")).unwrap(), History::default());
}

#[test]
fn round_trip_preserves_entries() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("h.yaml");
    let mut h = History::default();
    record(&mut h, entry("a"));
    save(&p, &h).unwrap();
    assert_eq!(load(&p).unwrap(), h);
}

#[test]
fn record_inserts_newest_first() {
    let mut h = History::default();
    record(&mut h, entry("old"));
    record(&mut h, entry("new"));
    assert_eq!(h.entries[0].id, "new");
    assert_eq!(h.entries[1].id, "old");
}

#[test]
fn record_caps_at_max_and_returns_evicted() {
    let mut h = History::default();
    for i in 0..MAX_HISTORY {
        assert!(record(&mut h, entry(&format!("e{i}"))).is_empty());
    }
    let evicted = record(&mut h, entry("overflow"));
    assert_eq!(h.entries.len(), MAX_HISTORY);
    assert_eq!(h.entries[0].id, "overflow");
    assert_eq!(evicted.len(), 1);
    assert_eq!(evicted[0].id, "e0");
}

#[test]
fn remove_by_path_drops_matching_entries_only() {
    let mut h = History::default();
    record(&mut h, entry_at("keep", "/ws/b.quantamind.yaml"));
    record(&mut h, entry_at("drop1", "/ws/a.quantamind.yaml"));
    record(&mut h, entry_at("drop2", "/ws/a.quantamind.yaml"));
    let removed = remove_by_path(&mut h, "/ws/a.quantamind.yaml");
    assert_eq!(removed.len(), 2);
    assert_eq!(h.entries.len(), 1);
    assert_eq!(h.entries[0].id, "keep");
}

#[test]
fn preview_truncates_to_280_chars() {
    let long = "x".repeat(500);
    assert_eq!(preview(&long).chars().count(), PREVIEW_CHARS);
    assert_eq!(preview("short"), "short");
}

#[test]
fn preview_counts_unicode_by_char_not_byte() {
    let s = "🎉".repeat(400);
    assert_eq!(preview(&s).chars().count(), PREVIEW_CHARS);
}
