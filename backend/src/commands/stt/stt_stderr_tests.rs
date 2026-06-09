use super::*;

#[test]
fn push_tail_keeps_only_the_last_cap_lines() {
    let mut t: VecDeque<String> = VecDeque::new();
    for i in 0..5 {
        push_tail(&mut t, format!("line {i}"), 3);
    }
    assert_eq!(t.len(), 3);
    assert_eq!(t.front().map(String::as_str), Some("line 2"));
    assert_eq!(t.back().map(String::as_str), Some("line 4"));
}

#[test]
fn push_tail_below_cap_keeps_everything_in_order() {
    let mut t: VecDeque<String> = VecDeque::new();
    push_tail(&mut t, "a".into(), 20);
    push_tail(&mut t, "b".into(), 20);
    assert_eq!(t.iter().cloned().collect::<Vec<_>>(), vec!["a", "b"]);
}
