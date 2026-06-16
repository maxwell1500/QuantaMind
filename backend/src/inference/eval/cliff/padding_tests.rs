use super::*;

const MULTIBYTE: &str = "café — ☕ déjà vu 日本語 ";

#[test]
fn safe_boundary_never_lands_mid_code_point() {
    let s = MULTIBYTE;
    for i in 0..=s.len() {
        let b = safe_boundary(s, i);
        assert!(s.is_char_boundary(b), "byte {i} -> {b} is not a char boundary");
        assert!(b <= i);
        // Slicing at the returned boundary must never panic.
        let _ = &s[..b];
    }
}

#[test]
fn safe_boundary_clamps_past_the_end() {
    assert_eq!(safe_boundary("abc", 99), 3);
}

#[test]
fn build_padding_lands_at_or_under_target_and_never_panics() {
    for target in [0usize, 1, 3, 100, 4096, 9000, 50_000] {
        let p = build_padding(MULTIBYTE, target);
        assert!(p.len() <= target, "{} > target {target}", p.len());
        // For any non-trivial target we should get close (within one source cycle).
        if target >= MULTIBYTE.len() {
            assert!(p.len() + MULTIBYTE.len() >= target, "padding fell far short of {target}");
        }
        assert!(std::str::from_utf8(p.as_bytes()).is_ok());
    }
}

#[test]
fn build_padding_empty_inputs_yield_empty() {
    assert_eq!(build_padding("", 1000), "");
    assert_eq!(build_padding("abc", 0), "");
}

#[test]
fn inject_places_the_needle_and_keeps_all_padding() {
    let padding = build_padding("0123456789", 100);
    let out = inject_at_depth(&padding, "NEEDLE", 0.5);
    assert!(out.contains("NEEDLE"));
    // The needle splits the padding but loses none of it.
    assert_eq!(out.replace("NEEDLE", "").replace("\n\n", "").len(), padding.len());
}

#[test]
fn inject_depth_moves_the_needle_earlier_or_later() {
    let padding = build_padding("0123456789", 200);
    let shallow = inject_at_depth(&padding, "X", 0.1).find('X').unwrap();
    let deep = inject_at_depth(&padding, "X", 0.9).find('X').unwrap();
    assert!(shallow < deep, "0.1 should place the needle before 0.9 ({shallow} vs {deep})");
}

#[test]
fn inject_into_multibyte_padding_never_panics() {
    let padding = build_padding(MULTIBYTE, 300);
    for depth in [0.0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0] {
        let out = inject_at_depth(&padding, "の", depth);
        assert!(out.contains('の'));
        assert!(std::str::from_utf8(out.as_bytes()).is_ok());
    }
}
