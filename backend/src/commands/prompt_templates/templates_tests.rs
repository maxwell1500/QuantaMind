use super::*;
use tempfile::tempdir;

#[test]
fn reads_md_files_sorted_by_name_ignoring_others() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("summarize.md"), "Summarize:\n{{input}}").unwrap();
    std::fs::write(dir.path().join("code-review.md"), "Review this code.").unwrap();
    std::fs::write(dir.path().join("notes.txt"), "ignored").unwrap();

    let got = read_templates(dir.path()).unwrap();
    assert_eq!(
        got,
        vec![
            PromptTemplate { name: "code-review".into(), body: "Review this code.".into() },
            PromptTemplate { name: "summarize".into(), body: "Summarize:\n{{input}}".into() },
        ]
    );
}

#[test]
fn empty_dir_yields_no_templates() {
    let dir = tempdir().unwrap();
    assert!(read_templates(dir.path()).unwrap().is_empty());
}
