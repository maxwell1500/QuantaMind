use super::*;
use tempfile::tempdir;

#[test]
fn scaffold_creates_dir_and_welcome_prompt() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("QuantaMind");
    let welcome = scaffold_in(&root).unwrap();
    assert!(welcome.exists());
    let loaded = io::read(&welcome).unwrap();
    assert_eq!(loaded.name, "welcome");
    assert!(loaded.user.contains("poem"));
}

#[test]
fn scaffold_is_idempotent_and_preserves_edits() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("QuantaMind");
    let welcome = scaffold_in(&root).unwrap();
    let mut edited = io::read(&welcome).unwrap();
    edited.user = "my own prompt".into();
    io::write(&welcome, &edited).unwrap();
    // Running scaffold again must not clobber the user's edit.
    scaffold_in(&root).unwrap();
    assert_eq!(io::read(&welcome).unwrap().user, "my own prompt");
}

#[test]
fn welcome_prompt_round_trips() {
    let pf = welcome_prompt("t".into());
    let yaml = serde_yaml::to_string(&pf).unwrap();
    let back: PromptFile = serde_yaml::from_str(&yaml).unwrap();
    assert_eq!(pf, back);
}
