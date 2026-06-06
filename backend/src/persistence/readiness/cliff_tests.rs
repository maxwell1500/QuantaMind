use super::*;
use tempfile::tempdir;

#[test]
fn round_trips_a_colon_bearing_model_verbatim() {
    let dir = tempdir().unwrap();
    save(dir.path(), "finance", "qwen2.5-coder:7b", 8192).unwrap();
    let map = load(dir.path(), "finance").unwrap();
    assert_eq!(map.get("qwen2.5-coder:7b"), Some(&8192)); // colon key preserved, not sanitized
}

#[test]
fn second_save_merges_and_does_not_clobber_other_models() {
    let dir = tempdir().unwrap();
    save(dir.path(), "finance", "a:1", 1000).unwrap();
    save(dir.path(), "finance", "b:2", 2000).unwrap();
    let map = load(dir.path(), "finance").unwrap();
    assert_eq!(map.get("a:1"), Some(&1000)); // first model survives the second save
    assert_eq!(map.get("b:2"), Some(&2000));

    // Last-write-wins per model.
    save(dir.path(), "finance", "a:1", 1500).unwrap();
    assert_eq!(load(dir.path(), "finance").unwrap().get("a:1"), Some(&1500));
}

#[test]
fn save_is_atomic_leaves_no_temp_file_and_stays_parseable() {
    let dir = tempdir().unwrap();
    save(dir.path(), "c", "m", 4096).unwrap();
    let names: Vec<String> =
        std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    assert!(names.iter().all(|n| !n.ends_with(".tmp")), "no temp file should remain: {names:?}");
    assert!(load(dir.path(), "c").is_ok()); // the live file always parses
}

#[test]
fn missing_collection_loads_an_empty_map() {
    let dir = tempdir().unwrap();
    assert!(load(dir.path(), "never").unwrap().is_empty());
}
