use super::transcript::Segment;

/// How far back to look for a duplicate — the overlap region only spans the last
/// few segments of the previous window.
const TAIL_LOOKBACK: usize = 8;

fn overlaps(a: &Segment, b: &Segment) -> bool {
    a.start_secs < b.end_secs && b.start_secs < a.end_secs
}

/// Compare on alphanumeric content only — lowercase, punctuation dropped,
/// whitespace collapsed — so `" hello world"` and `"Hello world."` (whisper's
/// boundary punctuation differs between windows) count as the same text.
fn norm(s: &str) -> String {
    let mut out = String::new();
    let mut prev_space = true;
    for c in s.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim().to_string()
}

/// Drop segments in `incoming` that duplicate the tail of `already_emitted` —
/// **same (trimmed, case-insensitive) text and an overlapping time range**.
///
/// Windows overlap by ~1 s so a word straddling a cut isn't truncated into
/// garbage; that overlap repeats the boundary segments, which this removes so the
/// emitted/persisted series stays monotonic + non-overlapping. A genuinely
/// distinct segment at the boundary (different text, or no time overlap) is kept.
pub fn dedupe_incoming(already_emitted: &[Segment], incoming: Vec<Segment>) -> Vec<Segment> {
    let start = already_emitted.len().saturating_sub(TAIL_LOOKBACK);
    let tail = &already_emitted[start..];
    incoming
        .into_iter()
        .filter(|seg| !tail.iter().any(|e| overlaps(e, seg) && norm(&e.text) == norm(&seg.text)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(text: &str, start: f64, end: f64) -> Segment {
        Segment {
            text: text.into(),
            start_secs: start,
            end_secs: end,
            avg_logprob: None,
            no_speech_prob: None,
            words: None,
        }
    }

    #[test]
    fn drops_overlapping_same_text_keeps_the_rest() {
        let existing = vec![seg(" hello world", 29.0, 31.0)];
        // Window 2 (overlap region) re-emits the boundary segment, then new content.
        let incoming = vec![seg("Hello world.", 29.2, 31.1), seg(" next part", 31.5, 33.0)];
        let kept = dedupe_incoming(&existing, incoming);
        assert_eq!(kept.len(), 1, "the duplicate boundary segment is dropped");
        assert_eq!(kept[0].text.trim(), "next part");
    }

    #[test]
    fn keeps_distinct_text_even_when_times_overlap() {
        let existing = vec![seg(" one", 29.0, 31.0)];
        let incoming = vec![seg(" two", 29.5, 31.2)]; // overlaps in time but different words
        assert_eq!(dedupe_incoming(&existing, incoming).len(), 1, "distinct text kept");
    }

    #[test]
    fn keeps_same_text_when_times_dont_overlap() {
        let existing = vec![seg(" yes", 10.0, 11.0)];
        let incoming = vec![seg(" yes", 40.0, 41.0)]; // a real repeat later in the audio
        assert_eq!(dedupe_incoming(&existing, incoming).len(), 1, "non-overlapping repeat kept");
    }

    #[test]
    fn empty_inputs_are_fine() {
        assert!(dedupe_incoming(&[], vec![]).is_empty());
        assert_eq!(dedupe_incoming(&[], vec![seg(" a", 0.0, 1.0)]).len(), 1);
    }
}
