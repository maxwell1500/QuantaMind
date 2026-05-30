use super::*;
use std::path::PathBuf;

#[test]
fn deletable_only_for_gguf_inside_the_weights_dir() {
    let dir = PathBuf::from("/g");
    assert!(is_deletable_gguf(&dir, &PathBuf::from("/g/phi.gguf")));
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/g/notes.txt")), "non-gguf rejected");
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/etc/passwd")), "outside dir rejected");
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/other/phi.gguf")), "wrong dir rejected");
}
