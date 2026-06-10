use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A critical reference token weighs this much more than an ordinary word in the
/// weighted WER — a missed dollar amount must dominate a missed "the".
const CRITICAL_WEIGHT: f64 = 5.0;
/// A substitution where the model was at least this confident is treated as a
/// likely **human misread** (the reader said something else), not a model error.
const MISREAD_CONF: f64 = 0.85;

/// One hypothesis word with the model's confidence (from `Transcript` word
/// probabilities; `None` when the backend emitted no word-level scores).
#[derive(Clone, Debug)]
pub struct HypWord {
    pub text: String,
    pub prob: Option<f64>,
}

/// A substitution the model made *confidently* — likely the reader deviated from
/// the script, so it's surfaced separately and excluded from `adjusted_wer`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Misread {
    pub reference: String,
    pub heard: String,
    pub probability: f64,
}

/// Word-error breakdown from sequence alignment (insertions/deletions don't smear
/// into substitutions). All rates are over the reference length.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WerResult {
    pub wer: f64,
    /// WER with critical-token errors up-weighted — the financial/legal signal.
    pub weighted_wer: f64,
    /// WER excluding likely human misreads (confident substitutions).
    pub adjusted_wer: f64,
    pub substitutions: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub ref_words: usize,
    /// Of the critical tokens present in the reference, the fraction transcribed
    /// correctly. `None` when the reference contains no critical tokens.
    pub critical_token_accuracy: Option<f64>,
    pub misreads: Vec<Misread>,
}

/// Normalize text to comparable words: lowercase, drop surrounding punctuation but
/// keep `$`/`%` (so "$100." → "$100", "Ruben," → "ruben").
fn normalize(text: &str) -> Vec<String> {
    text.split_whitespace()
        .filter_map(|w| {
            let w = w.trim_matches(|c: char| c.is_ascii_punctuation() && c != '$' && c != '%');
            (!w.is_empty()).then(|| w.to_lowercase())
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq)]
enum Op {
    Match,
    Sub,
    Ins,
    Del,
}

/// Word-level WER via Levenshtein with backtrace. `reference` is the ground truth;
/// `hyp` the model's words (with confidences); `critical_tokens` are up-weighted.
/// The DP matrix is a function-local `Vec` freed on return (Hirschberg is the
/// O(n)-space upgrade if transcripts ever get pathologically long).
pub fn score_wer(reference: &str, hyp: &[HypWord], critical_tokens: &[String]) -> WerResult {
    let r: Vec<String> = normalize(reference);
    let h: Vec<(String, Option<f64>)> = hyp
        .iter()
        .flat_map(|w| normalize(&w.text).into_iter().map(move |t| (t, w.prob)))
        .collect();
    let crit: HashSet<String> = critical_tokens.iter().flat_map(|t| normalize(t)).collect();

    let (n, m) = (r.len(), h.len());
    // dp[i][j] = min word-edits from r[0..i] to h[0..j].
    let mut dp = vec![vec![0usize; m + 1]; n + 1];
    for i in 0..=n {
        dp[i][0] = i;
    }
    for j in 0..=m {
        dp[0][j] = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            dp[i][j] = if r[i - 1] == h[j - 1].0 {
                dp[i - 1][j - 1]
            } else {
                (dp[i - 1][j - 1] + 1).min(dp[i - 1][j] + 1).min(dp[i][j - 1] + 1)
            };
        }
    }

    // Backtrace to recover the op at each step.
    let mut ops: Vec<(Op, usize, usize)> = Vec::new(); // (op, ref idx, hyp idx)
    let (mut i, mut j) = (n, m);
    while i > 0 || j > 0 {
        if i > 0 && j > 0 && r[i - 1] == h[j - 1].0 && dp[i][j] == dp[i - 1][j - 1] {
            ops.push((Op::Match, i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1 {
            ops.push((Op::Sub, i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if j > 0 && dp[i][j] == dp[i][j - 1] + 1 {
            ops.push((Op::Ins, i, j - 1));
            j -= 1;
        } else {
            ops.push((Op::Del, i - 1, j));
            i -= 1;
        }
    }

    let (mut subs, mut ins, mut del) = (0usize, 0usize, 0usize);
    let mut weighted_err = 0.0;
    let mut crit_total = 0usize;
    let mut crit_correct = 0usize;
    let mut misreads = Vec::new();
    let wt = |word: &str| if crit.contains(word) { CRITICAL_WEIGHT } else { 1.0 };

    for (op, ri, hj) in &ops {
        match op {
            Op::Match => {
                if crit.contains(&r[*ri]) {
                    crit_total += 1;
                    crit_correct += 1;
                }
            }
            Op::Sub => {
                subs += 1;
                weighted_err += wt(&r[*ri]);
                if crit.contains(&r[*ri]) {
                    crit_total += 1;
                }
                if let Some(p) = h[*hj].1 {
                    if p >= MISREAD_CONF {
                        misreads.push(Misread {
                            reference: r[*ri].clone(),
                            heard: h[*hj].0.clone(),
                            probability: p,
                        });
                    }
                }
            }
            Op::Del => {
                del += 1;
                weighted_err += wt(&r[*ri]);
                if crit.contains(&r[*ri]) {
                    crit_total += 1;
                }
            }
            Op::Ins => {
                ins += 1;
                weighted_err += 1.0; // an inserted word maps to no reference word
            }
        }
    }

    let denom = n.max(1) as f64;
    let weighted_ref: f64 = r.iter().map(|w| wt(w)).sum::<f64>().max(1.0);
    let errors = (subs + ins + del) as f64;
    // Misread substitutions are the reader's slip, not the model's — drop them.
    let adjusted_errors = errors - misreads.len() as f64;

    WerResult {
        wer: errors / denom,
        weighted_wer: weighted_err / weighted_ref,
        adjusted_wer: adjusted_errors.max(0.0) / denom,
        substitutions: subs,
        insertions: ins,
        deletions: del,
        ref_words: n,
        critical_token_accuracy: (crit_total > 0).then(|| crit_correct as f64 / crit_total as f64),
        misreads,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(s: &str) -> Vec<HypWord> {
        s.split_whitespace().map(|w| HypWord { text: w.into(), prob: None }).collect()
    }
    fn words_conf(pairs: &[(&str, f64)]) -> Vec<HypWord> {
        pairs.iter().map(|(w, p)| HypWord { text: (*w).into(), prob: Some(*p) }).collect()
    }

    #[test]
    fn a_perfect_transcript_scores_zero() {
        let r = score_wer("transfer one hundred dollars", &words("transfer one hundred dollars"), &[]);
        assert_eq!(r.wer, 0.0);
        assert_eq!(r.weighted_wer, 0.0);
        assert_eq!((r.substitutions, r.insertions, r.deletions), (0, 0, 0));
    }

    #[test]
    fn a_pure_insertion_does_not_smear_into_subs_or_dels() {
        // hyp has an extra "really" — exactly one insertion, nothing else.
        let r = score_wer("send the email", &words("send the really email"), &[]);
        assert_eq!((r.substitutions, r.insertions, r.deletions), (0, 1, 0));
        assert!((r.wer - 1.0 / 3.0).abs() < 1e-9, "wer {}", r.wer);
    }

    #[test]
    fn a_pure_deletion_does_not_smear() {
        // hyp dropped "the" — exactly one deletion.
        let r = score_wer("send the email", &words("send email"), &[]);
        assert_eq!((r.substitutions, r.insertions, r.deletions), (0, 0, 1));
    }

    #[test]
    fn a_missed_critical_token_dominates_the_weighted_wer() {
        // Reference "$100"; model heard "$110" → one substitution. Plain WER is
        // small, but the weighted WER is large because the amount is critical.
        let r = score_wer("transfer $100 now", &words("transfer $110 now"), &["$100".into()]);
        assert_eq!(r.substitutions, 1);
        assert!((r.wer - 1.0 / 3.0).abs() < 1e-9);
        assert!(r.weighted_wer > r.wer, "weighted {} should exceed plain {}", r.weighted_wer, r.wer);
        assert_eq!(r.critical_token_accuracy, Some(0.0), "the critical amount was wrong");
    }

    #[test]
    fn critical_token_accuracy_counts_only_critical_words() {
        // Two criticals ("$100","ruben"); model got ruben, missed the amount.
        let r = score_wer("pay $100 to ruben", &words("pay $110 to ruben"), &["$100".into(), "ruben".into()]);
        assert_eq!(r.critical_token_accuracy, Some(0.5));
    }

    #[test]
    fn no_critical_tokens_gives_none_accuracy() {
        let r = score_wer("hello world", &words("hello world"), &[]);
        assert_eq!(r.critical_token_accuracy, None);
    }

    #[test]
    fn a_confident_substitution_is_flagged_a_misread_and_excluded_from_adjusted() {
        // Reference "ruben" but the model confidently heard "reuben" → likely the
        // reader's slip, not a model error: flagged + dropped from adjusted_wer.
        let r = score_wer(
            "email ruben today",
            &words_conf(&[("email", 0.99), ("reuben", 0.97), ("today", 0.99)]),
            &[],
        );
        assert_eq!(r.substitutions, 1);
        assert_eq!(r.misreads.len(), 1);
        assert_eq!(r.misreads[0].reference, "ruben");
        assert!(r.adjusted_wer < r.wer, "adjusted {} < plain {}", r.adjusted_wer, r.wer);
        assert_eq!(r.adjusted_wer, 0.0, "the only error was the reader's misread");
    }

    #[test]
    fn a_low_confidence_substitution_is_not_a_misread() {
        let r = score_wer("email ruben", &words_conf(&[("email", 0.99), ("reuben", 0.40)]), &[]);
        assert!(r.misreads.is_empty(), "low-confidence sub is a model error, not a misread");
        assert!((r.adjusted_wer - r.wer).abs() < 1e-9);
    }
}
