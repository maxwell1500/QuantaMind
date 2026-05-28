use super::*;
use tempfile::tempdir;

fn entry(p: &str, t: &str) -> RecentEntry {
    RecentEntry { path: p.into(), opened_at: t.into() }
}

#[test]
fn load_missing_returns_empty() {
    let dir = tempdir().unwrap();
    assert_eq!(load(&dir.path().join("nope.yaml")).unwrap(), RecentList::default());
}

#[test]
fn empty_file_loads_as_empty() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("empty.yaml");
    std::fs::write(&p, "").unwrap();
    assert_eq!(load(&p).unwrap(), RecentList::default());
}

#[test]
fn save_and_load_round_trip() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("r.yaml");
    let list = RecentList { entries: vec![entry("/a", "t1"), entry("/b", "t2")] };
    save(&p, &list).unwrap();
    assert_eq!(load(&p).unwrap(), list);
}

#[test]
fn save_creates_missing_parent_dir() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("nested/r.yaml");
    save(&p, &RecentList::default()).unwrap();
    assert!(p.exists());
}

#[test]
fn record_moves_existing_to_front() {
    let mut list = RecentList { entries: vec![entry("/a", "t1"), entry("/b", "t2")] };
    record(&mut list, entry("/a", "t3"));
    assert_eq!(list.entries[0].path, "/a");
    assert_eq!(list.entries[0].opened_at, "t3");
    assert_eq!(list.entries.len(), 2);
}

#[test]
fn record_inserts_new_at_front() {
    let mut list = RecentList { entries: vec![entry("/a", "t1")] };
    record(&mut list, entry("/b", "t2"));
    assert_eq!(list.entries[0].path, "/b");
    assert_eq!(list.entries[1].path, "/a");
}

#[test]
fn record_caps_at_max_recents() {
    let mut list = RecentList::default();
    for i in 0..15 {
        record(&mut list, entry(&format!("/p{}", i), "t"));
    }
    assert_eq!(list.entries.len(), MAX_RECENTS);
    assert_eq!(list.entries[0].path, "/p14");
}

#[test]
fn record_evicts_oldest_when_full() {
    let mut list = RecentList::default();
    for i in 0..MAX_RECENTS {
        record(&mut list, entry(&format!("/p{}", i), "t"));
    }
    record(&mut list, entry("/new", "t"));
    assert!(!list.entries.iter().any(|e| e.path == "/p0"));
    assert_eq!(list.entries[0].path, "/new");
}
