use super::*;
use std::fs;

/// Clearing wipes only the regenerable caches and reports the exact bytes freed,
/// while user-authored data (evals/, readiness/) and settings survive untouched.
#[test]
fn clear_removes_caches_keeps_user_data_and_counts_bytes() {
    let base = tempfile::tempdir().unwrap();
    let p = base.path();

    // Regenerable caches (must be deleted). Sizes chosen so the total is exact.
    fs::create_dir_all(p.join("jobs")).unwrap();
    fs::write(p.join("jobs/run1.jsonl"), vec![0u8; 100]).unwrap();
    fs::create_dir_all(p.join("history")).unwrap();
    fs::write(p.join("history/coll.json"), vec![0u8; 50]).unwrap();
    fs::create_dir_all(p.join("batch_reports")).unwrap();
    fs::write(p.join("batch_reports/coll.json"), vec![0u8; 30]).unwrap();
    fs::create_dir_all(p.join("traces/nested")).unwrap();
    fs::write(p.join("traces/nested/t.json"), vec![0u8; 20]).unwrap();
    fs::create_dir_all(p.join("cliff")).unwrap();
    fs::write(p.join("cliff/coll.json"), vec![0u8; 5]).unwrap();
    fs::write(p.join("recent_workspaces.yaml"), vec![0u8; 10]).unwrap();

    // User-authored data and settings (must be preserved).
    fs::create_dir_all(p.join("evals")).unwrap();
    fs::write(p.join("evals/my_collection.json"), b"keep").unwrap();
    fs::create_dir_all(p.join("readiness")).unwrap();
    fs::write(p.join("readiness/profile.json"), b"keep").unwrap();
    fs::write(p.join("user_settings.yaml"), b"keep").unwrap();
    fs::write(p.join("model_settings.yaml"), b"keep").unwrap();

    let freed = clear_cache_in(p).unwrap();

    assert_eq!(freed, 100 + 50 + 30 + 20 + 5 + 10, "freed bytes is the measured sum");

    for gone in ["jobs", "history", "batch_reports", "traces", "cliff"] {
        assert!(!p.join(gone).exists(), "{gone}/ should be deleted");
    }
    assert!(!p.join("recent_workspaces.yaml").exists(), "recents file should be deleted");

    assert!(p.join("evals/my_collection.json").exists(), "custom collections preserved");
    assert!(p.join("readiness/profile.json").exists(), "readiness profiles preserved");
    assert!(p.join("user_settings.yaml").exists(), "user settings preserved");
    assert!(p.join("model_settings.yaml").exists(), "model settings preserved");
}

/// Clearing an empty config dir is a no-op that frees zero bytes, not an error.
#[test]
fn clear_on_empty_dir_is_noop() {
    let base = tempfile::tempdir().unwrap();
    let freed = clear_cache_in(base.path()).unwrap();
    assert_eq!(freed, 0);
}
