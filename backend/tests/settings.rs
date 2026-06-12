use quantamind_lib::commands::settings::settings::validate_storage_path;
use std::io::Write;

#[test]
fn validate_storage_path_nonexistent_returns_exists_false() {
    let r = validate_storage_path("/__definitely_does_not_exist_zzz/x".into()).unwrap();
    assert!(!r.exists);
    assert!(!r.is_dir);
    assert!(!r.writable);
}

#[test]
fn validate_storage_path_real_directory_is_writable_with_positive_free_space() {
    let dir = tempfile::tempdir().unwrap();
    let r = validate_storage_path(dir.path().to_string_lossy().into_owned()).unwrap();
    assert!(r.exists);
    assert!(r.is_dir);
    assert!(r.writable, "tempdir should be writable");
    assert!(r.total_bytes > 0, "tempdir disk should report nonzero total");
    assert!(r.free_bytes <= r.total_bytes);
}

#[test]
fn validate_storage_path_file_not_dir_reports_is_dir_false() {
    let mut tmp = tempfile::NamedTempFile::new().unwrap();
    tmp.write_all(b"not a directory").unwrap();
    let r = validate_storage_path(tmp.path().to_string_lossy().into_owned()).unwrap();
    assert!(r.exists);
    assert!(!r.is_dir);
    assert!(!r.writable);
}

#[test]
fn validate_storage_path_sufficient_flag_reflects_50gb_threshold() {
    // We can't synthesize disk space, but we can confirm the flag is
    // consistent with `free_bytes >= 50GB`.
    let dir = tempfile::tempdir().unwrap();
    let r = validate_storage_path(dir.path().to_string_lossy().into_owned()).unwrap();
    let fifty_gb = 50u64 * 1024 * 1024 * 1024;
    assert_eq!(r.sufficient, r.free_bytes >= fifty_gb);
}
