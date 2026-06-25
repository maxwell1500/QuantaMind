//! Deterministic OCR scoring: a model's extracted text vs bundled ground truth. CER + WER via a
//! Levenshtein edit distance (the same DP pattern as `stt/eval/wer.rs`, but lean plain-text — OCR
//! output carries no per-token confidences). The `HallucinatedContent` verdict is the load-bearing
//! signal: it must mean **invented plausible content** (the untrustworthy-on-real-PDFs failure),
//! distinguished from mere inaccuracy (typos → high WER, faithful) AND from pure garbage/noise
//! (errors everywhere). The "aligned-portion-faithful" guard is what draws that line.

use serde::{Deserialize, Serialize};

/// A hallucination needs the model to have ADDED a lot of content absent from the reference: the
/// insertion count must exceed this fraction of the reference length. Deliberately high (≥ half the
/// reference re-invented) so a slightly-verbose-but-faithful read isn't flagged.
const HALLUCINATION_INSERT_RATE: f64 = 0.5;
/// …AND the aligned portion must be otherwise faithful (the model got the REAL text right and added
/// invented lines on top). If substitutions+deletions exceed this fraction, the output is noise, not
/// confabulation — high WER, but NOT hallucinated. This guard separates invention from garbage.
const FAITHFUL_ALIGNED_MAX: f64 = 0.34;

/// CER/WER + the edit-op breakdown for the extracted text vs the reference.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OcrMetrics {
    /// Character error rate = char edit distance / reference chars.
    pub cer: f64,
    /// Word error rate = (subs + ins + dels) / reference words.
    pub wer: f64,
    pub substitutions: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub ref_words: usize,
    /// Of the critical tokens present in the reference, the fraction present in the extraction.
    /// `None` when the reference contains no critical token.
    pub critical_token_accuracy: Option<f64>,
}

/// Score extracted `hypothesis` text against the ground-truth `reference`. Pure + deterministic.
pub fn score_ocr(reference: &str, hypothesis: &str, critical_tokens: &[String]) -> OcrMetrics {
    let ref_words = words(reference);
    let hyp_words = words(hypothesis);
    let (substitutions, insertions, deletions) = edit_ops(&ref_words, &hyp_words);
    let rw = ref_words.len().max(1) as f64;
    let wer = (substitutions + insertions + deletions) as f64 / rw;

    let ref_chars = chars(reference);
    let hyp_chars = chars(hypothesis);
    let (cs, ci, cd) = edit_ops(&ref_chars, &hyp_chars);
    let cer = (cs + ci + cd) as f64 / ref_chars.len().max(1) as f64;

    OcrMetrics {
        cer,
        wer,
        substitutions,
        insertions,
        deletions,
        ref_words: ref_words.len(),
        critical_token_accuracy: critical_accuracy(&ref_words, &hyp_words, critical_tokens),
    }
}

/// Did the model invent plausible content (vs merely err, vs emit noise)? High insertion rate AND an
/// otherwise-faithful aligned portion. See the const docs for the boundary rationale.
pub fn is_hallucinated(m: &OcrMetrics) -> bool {
    let rw = m.ref_words.max(1) as f64;
    let insert_rate = m.insertions as f64 / rw;
    let faithful_err = (m.substitutions + m.deletions) as f64 / rw;
    insert_rate >= HALLUCINATION_INSERT_RATE && faithful_err <= FAITHFUL_ALIGNED_MAX
}

/// Canonicalize for scoring: lowercase + collapse all whitespace to single spaces, trimmed. So
/// layout/whitespace noise doesn't dominate the score (OCR line-wrapping isn't a content error).
fn canonical(s: &str) -> String {
    s.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn words(s: &str) -> Vec<String> {
    let c = canonical(s);
    if c.is_empty() {
        return vec![];
    }
    c.split(' ').map(str::to_string).collect()
}

fn chars(s: &str) -> Vec<char> {
    canonical(s).chars().collect()
}

/// Levenshtein with op recovery: returns (substitutions, insertions, deletions). An INSERTION is a
/// hypothesis token absent from the reference; a DELETION is a reference token missing from the
/// hypothesis. Generic over chars/words.
fn edit_ops<T: PartialEq>(reference: &[T], hyp: &[T]) -> (usize, usize, usize) {
    let (n, m) = (reference.len(), hyp.len());
    let mut dp = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in dp.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=m {
        dp[0][j] = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            dp[i][j] = if reference[i - 1] == hyp[j - 1] {
                dp[i - 1][j - 1]
            } else {
                1 + dp[i - 1][j - 1].min(dp[i - 1][j]).min(dp[i][j - 1])
            };
        }
    }
    let (mut i, mut j) = (n, m);
    let (mut subs, mut ins, mut dels) = (0, 0, 0);
    while i > 0 || j > 0 {
        if i > 0 && j > 0 && reference[i - 1] == hyp[j - 1] {
            i -= 1;
            j -= 1;
        } else if i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1 {
            subs += 1;
            i -= 1;
            j -= 1;
        } else if j > 0 && dp[i][j] == dp[i][j - 1] + 1 {
            ins += 1; // extra hypothesis token
            j -= 1;
        } else {
            dels += 1; // reference token missing
            i -= 1;
        }
    }
    (subs, ins, dels)
}

/// Fraction of the reference's critical tokens that also appear in the hypothesis (case-insensitive
/// word membership). `None` when no critical token is present in the reference.
fn critical_accuracy(ref_words: &[String], hyp_words: &[String], critical: &[String]) -> Option<f64> {
    let lower: Vec<String> = critical.iter().map(|c| c.to_lowercase()).collect();
    let present: Vec<&String> = lower.iter().filter(|c| ref_words.iter().any(|w| w == *c)).collect();
    if present.is_empty() {
        return None;
    }
    let hit = present.iter().filter(|c| hyp_words.iter().any(|w| w == **c)).count();
    Some(hit as f64 / present.len() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_scores_zero() {
        let m = score_ocr("Invoice total: $42.00", "Invoice total: $42.00", &[]);
        assert_eq!(m.cer, 0.0);
        assert_eq!(m.wer, 0.0);
        assert!(!is_hallucinated(&m));
    }

    #[test]
    fn one_char_error_is_a_specific_small_cer() {
        // GOLDEN value (not just "non-zero"): ref "timeout: 30" (11 chars) vs "timeout: 3O" → after
        // lowercasing, '0' vs 'o' = exactly ONE substitution → CER = 1/11.
        let m = score_ocr("timeout: 30", "timeout: 3O", &[]);
        assert!((m.cer - 1.0 / 11.0).abs() < 1e-9, "cer was {}", m.cer);
        assert!(!is_hallucinated(&m));
    }

    #[test]
    fn garbled_output_is_high_error_not_hallucinated() {
        // Pure noise (no alignment): high WER but the aligned-faithful guard keeps it NOT hallucinated.
        let m = score_ocr("alpha beta gamma delta", "zeta eta theta iota kappa lambda mu nu", &[]);
        assert!(m.wer >= 1.0, "wer {}", m.wer);
        assert!(!is_hallucinated(&m), "garbage must not be labeled hallucinated");
    }

    #[test]
    fn ocr_typos_are_high_wer_but_not_hallucinated() {
        // Faithful read with substitution-type errors, no invented content → high WER, not flagged.
        let m = score_ocr("the quick brown fox jumps", "teh quikc brown fox jumps", &[]);
        assert!(m.insertions == 0);
        assert!(!is_hallucinated(&m));
    }

    #[test]
    fn invented_extra_content_is_hallucinated() {
        // Faithful read of the whole reference PLUS an invented trailing line → confabulation.
        let m = score_ocr("total is forty two dollars", "total is forty two dollars and a free gift included", &[]);
        assert_eq!(m.substitutions, 0);
        assert_eq!(m.deletions, 0);
        assert!(m.insertions >= 4);
        assert!(is_hallucinated(&m), "invented content must be flagged");
    }

    #[test]
    fn critical_token_accuracy_tracks_required_entities() {
        let crit = vec!["$42.00".to_string()];
        let hit = score_ocr("total $42.00 paid", "total $42.00 paid", &crit);
        assert_eq!(hit.critical_token_accuracy, Some(1.0));
        let miss = score_ocr("total $42.00 paid", "total $43.00 paid", &crit);
        assert_eq!(miss.critical_token_accuracy, Some(0.0));
        // No critical token in the reference → None (never a fabricated 0/1).
        assert_eq!(score_ocr("plain text", "plain text", &crit).critical_token_accuracy, None);
    }
}
