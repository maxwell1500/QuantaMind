use serde::Serialize;
use std::collections::VecDeque;

/// Coarse launch phase reported to the UI. `Downloading`/`Starting` come from
/// stderr; `Ready` is decided by the health probe and `Exited` by `try_wait` —
/// stderr is never treated as the authoritative ready signal.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Downloading,
    Starting,
    Ready,
    Exited,
}

/// Classify one stderr line, returning `Some` only on a confident signal so the
/// reader keeps the last meaningful phase (avoids flicker from noise lines).
/// HF logs "Downloading"/"Fetching"; the server logs "running"/"uvicorn" as it
/// comes up.
pub fn phase_from_line(line: &str) -> Option<Phase> {
    let l = line.to_ascii_lowercase();
    if l.contains("download") || l.contains("fetch") {
        Some(Phase::Downloading)
    } else if l.contains("uvicorn") || l.contains("running on") || l.contains("started server") {
        Some(Phase::Starting)
    } else {
        None
    }
}

/// Append to a bounded tail ring (keep the last `cap` lines) for surfacing the
/// reason when the process dies.
pub fn push_tail(tail: &mut VecDeque<String>, line: String, cap: usize) {
    if tail.len() >= cap {
        tail.pop_front();
    }
    tail.push_back(line);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_download_and_startup_lines_ignores_noise() {
        assert_eq!(phase_from_line("Downloading shards: 50%"), Some(Phase::Downloading));
        assert_eq!(phase_from_line("Fetching 5 files"), Some(Phase::Downloading));
        assert_eq!(
            phase_from_line("INFO: Uvicorn running on http://127.0.0.1:8083"),
            Some(Phase::Starting),
        );
        assert_eq!(phase_from_line("some unrelated log line"), None);
    }

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
}
