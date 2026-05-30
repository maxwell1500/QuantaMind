use super::*;
use crate::persistence::bench::schema::{BenchConfig, BenchModel};
use tempfile::tempdir;

fn cfg(name: &str) -> BenchConfig {
    BenchConfig {
        name: name.into(),
        models: vec![BenchModel { name: "llama3:1b".into(), size_bytes: 100 }],
        strategy: "parallel".into(),
        system: "sys".into(),
        user: "hi".into(),
        created_at: "t".into(),
        updated_at: "t".into(),
    }
}

#[test]
fn round_trips_through_yaml() {
    let dir = tempdir().unwrap();
    let p = dir.path().join("a.bench.yaml");
    write(&p, &cfg("a")).unwrap();
    assert_eq!(read(&p).unwrap(), cfg("a"));
}

#[test]
fn list_finds_only_bench_files_sorted() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("b.bench.yaml"), &cfg("b")).unwrap();
    write(&dir.path().join("a.bench.yaml"), &cfg("a")).unwrap();
    std::fs::write(dir.path().join("notes.txt"), "x").unwrap();
    std::fs::write(dir.path().join("p.quantamind.yaml"), "x").unwrap();
    let names: Vec<String> = list(dir.path()).unwrap().into_iter().map(|(n, _)| n).collect();
    assert_eq!(names, vec!["a", "b"]);
}
