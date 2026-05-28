// Data-quality check for Step 2.3: per-workspace history caps at 50 with
// LRU eviction, output blobs live under .quantamind/runs, and evicting an
// entry lets the caller drop its blob. Mirrors the glue in
// commands/history.rs against real temp dirs.

use quantamind_lib::persistence::prompts::history::{self, History, HistoryEntry, MAX_HISTORY};
use quantamind_lib::persistence::prompts::schema::InferenceParams;
use tempfile::tempdir;

fn entry(id: &str, output: &str) -> HistoryEntry {
    HistoryEntry {
        id: id.into(), prompt_path: Some("/ws/a.quantamind.yaml".into()),
        model: "llama3".into(), system: String::new(), user: format!("run {id}"),
        params: InferenceParams::default(),
        output_preview: history::preview(output),
        output_len: output.chars().count(), token_count: 4, ran_at: "t".into(),
    }
}

#[test]
fn caps_at_fifty_and_evicts_oldest_blob() {
    let ws = tempdir().unwrap();
    let q = ws.path().join(".quantamind");
    let runs = q.join("runs");
    std::fs::create_dir_all(&runs).unwrap();
    let hpath = q.join("history.yaml");

    // Append 51 runs, each with an output blob, mirroring the command.
    let mut h = History::default();
    for i in 0..=MAX_HISTORY {
        let id = format!("e{i}");
        std::fs::write(runs.join(format!("{id}.txt")), format!("output {i}")).unwrap();
        let evicted = history::record(&mut h, entry(&id, &format!("output {i}")));
        history::save(&hpath, &h).unwrap();
        for e in evicted {
            std::fs::remove_file(runs.join(format!("{}.txt", e.id))).unwrap();
        }
    }

    // Exactly 50 entries remain; the newest is first, oldest (e0) gone.
    let loaded = history::load(&hpath).unwrap();
    assert_eq!(loaded.entries.len(), MAX_HISTORY);
    assert_eq!(loaded.entries[0].id, format!("e{MAX_HISTORY}"));
    assert!(!loaded.entries.iter().any(|e| e.id == "e0"));

    // The evicted blob is gone; a surviving blob is still readable.
    assert!(!runs.join("e0.txt").exists());
    let survivor = &loaded.entries[0].id;
    assert!(runs.join(format!("{survivor}.txt")).exists());
}

#[test]
fn preview_and_len_reflect_full_output() {
    let big = "z".repeat(1000);
    let e = entry("x", &big);
    assert_eq!(e.output_len, 1000);
    assert_eq!(e.output_preview.chars().count(), history::PREVIEW_CHARS);
}
