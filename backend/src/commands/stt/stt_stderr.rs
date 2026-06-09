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
#[path = "stt_stderr_tests.rs"]
mod tests;
