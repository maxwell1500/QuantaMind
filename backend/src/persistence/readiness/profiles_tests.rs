use super::*;
use tempfile::tempdir;

fn custom(id: &str, name: &str, min_pass_k: f64) -> ReadinessProfile {
    ReadinessProfile {
        id: id.into(),
        name: name.into(),
        min_pass_k,
        max_avg_steps: None,
        max_ms_per_step: None,
        min_context_tokens: None,
        forbid_infinite_loop: true,
        forbid_hallucinated_completion: false,
        require_full_vram: false,
        require_native_fc: false,
        required_tier: crate::inference::eval::agentic::spec::Tier::Easy,
    }
}

#[test]
fn list_seeds_the_builtins_on_first_call() {
    let dir = tempdir().unwrap();
    let profiles = list(dir.path()).unwrap();
    let ids: Vec<&str> = profiles.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"coding-agent"));
    assert!(ids.contains(&"rag-assistant"));
    assert!(ids.contains(&"general-agent"));
    // Sorted by name for a stable picker.
    let names: Vec<&str> = profiles.iter().map(|p| p.name.as_str()).collect();
    let mut sorted = names.clone();
    sorted.sort();
    assert_eq!(names, sorted);
}

#[test]
fn save_then_load_round_trips_a_custom_profile() {
    let dir = tempdir().unwrap();
    let p = custom("my-strict", "My strict", 0.9);
    save(dir.path(), &p).unwrap();
    assert_eq!(load(dir.path(), "my-strict").unwrap(), p);
}

#[test]
fn long_shared_prefix_ids_do_not_overwrite_each_other() {
    let dir = tempdir().unwrap();
    let base = "company-evals-qwen3-coder-agentic-v1-test-suite";
    let a = custom(&format!("{base}-AAAA"), "A", 0.5);
    let b = custom(&format!("{base}-BBBB"), "B", 0.9);
    save(dir.path(), &a).unwrap();
    save(dir.path(), &b).unwrap();
    // Both survive — the collision-proof filename keeps them on distinct files.
    assert_eq!(load(dir.path(), &a.id).unwrap().min_pass_k, 0.5);
    assert_eq!(load(dir.path(), &b.id).unwrap().min_pass_k, 0.9);
}

#[test]
fn delete_removes_a_profile() {
    let dir = tempdir().unwrap();
    let p = custom("temp", "Temp", 0.5);
    save(dir.path(), &p).unwrap();
    delete(dir.path(), "temp").unwrap();
    assert!(load(dir.path(), "temp").is_err());
}

#[test]
fn load_missing_is_not_found() {
    let dir = tempdir().unwrap();
    assert!(load(dir.path(), "nope").is_err());
}

#[test]
fn oversize_profile_file_is_rejected_not_oomed() {
    let dir = tempdir().unwrap();
    let path = profile_path(dir.path(), "huge");
    std::fs::create_dir_all(dir.path()).unwrap();
    std::fs::write(&path, vec![b' '; (MAX_BYTES + 1) as usize]).unwrap();
    assert!(load(dir.path(), "huge").is_err());
}
