use crate::sync::MutexExt;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::ChildStderr;
use std::sync::{Arc, Mutex};

/// How many trailing stderr lines to retain for the death diagnosis.
const TAIL_CAP: usize = 20;

/// Append to a bounded tail ring (keep the last `cap` lines) so the reason a
/// whisper-server died — a bad VAD flag, a corrupt model, a missing dylib — can
/// be surfaced on `StartFailed` instead of a bare timeout. Readiness itself
/// comes from the server's `/health`, not from stderr, so this ring is purely
/// for diagnosis.
pub fn push_tail(tail: &mut VecDeque<String>, line: String, cap: usize) {
    if tail.len() >= cap {
        tail.pop_front();
    }
    tail.push_back(line);
}

/// Drain the child's piped stderr on a background thread, keeping the last
/// `TAIL_CAP` lines. Ends when the stream closes (process exit).
pub fn spawn_stderr_reader(stderr: ChildStderr, tail: Arc<Mutex<VecDeque<String>>>) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            push_tail(&mut tail.lock_recover(), line, TAIL_CAP);
        }
    });
}

#[cfg(test)]
mod tests {
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
}
