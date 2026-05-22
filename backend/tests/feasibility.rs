use splice_lib::commands::feasibility::{assess, InstallFeasibility};

const GB: u64 = 1024 * 1024 * 1024;

#[test]
fn ok_when_plenty_of_space() {
    assert_eq!(assess(100 * GB, 5 * GB), InstallFeasibility::Ok);
}

#[test]
fn warning_when_under_10gb_after_install() {
    // 12GB free, install 5GB (+5% margin) → ~6.75GB free after → warn.
    let f = assess(12 * GB, 5 * GB);
    let InstallFeasibility::Warning { free_after_bytes } = f else {
        panic!("expected Warning, got {f:?}");
    };
    assert!(free_after_bytes < 10 * GB);
    assert!(free_after_bytes >= 2 * GB);
}

#[test]
fn blocked_when_under_2gb_after_install() {
    let f = assess(3 * GB, 5 * GB);
    let InstallFeasibility::BlockedInsufficientSpace {
        free_after_bytes,
        free_bytes,
        needed_bytes,
    } = f
    else {
        panic!("expected BlockedInsufficientSpace, got {f:?}");
    };
    assert_eq!(free_after_bytes, 0);
    assert_eq!(free_bytes, 3 * GB);
    assert!(needed_bytes >= 5 * GB);
}

#[test]
fn zero_free_always_blocks() {
    assert!(matches!(
        assess(0, GB),
        InstallFeasibility::BlockedInsufficientSpace { .. }
    ));
}

#[test]
fn zero_estimated_returns_warning_not_panic() {
    assert!(matches!(
        assess(100 * GB, 0),
        InstallFeasibility::Warning { .. }
    ));
}

#[test]
fn five_percent_safety_margin_is_applied() {
    // 11GB free, install 10GB → margin 0.5GB → needed 10.5GB → 0.5GB left → blocked.
    assert!(matches!(
        assess(11 * GB, 10 * GB),
        InstallFeasibility::BlockedInsufficientSpace { .. }
    ));
}
