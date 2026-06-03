use serde::Serialize;

/// How a single agentic run failed. Each maps to exactly one `FailureTracker`
/// tally so the categories never overlap.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailureKind {
    /// Hit the step cap without reaching the end state.
    InfiniteLoop,
    /// Yielded claiming completion without satisfying the EndStateRule.
    Hallucinated,
    /// Yielded with broken JSON where a call was attempted.
    Malformed,
}

/// The result of ONE agentic attempt — the unit the Pass^k loop folds into an
/// `AgenticReport`. `output_tokens` is the cumulative `eval_count` for this run
/// (output tokens only; prompt tokens are deliberately never summed).
#[derive(Clone, Debug, PartialEq)]
pub struct RunOutcome {
    pub reached_end: bool,
    pub steps: u32,
    pub output_tokens: u32,
    pub failure: Option<FailureKind>,
}

impl RunOutcome {
    pub fn success(steps: u32, output_tokens: u32) -> Self {
        Self { reached_end: true, steps, output_tokens, failure: None }
    }

    pub fn failure(steps: u32, output_tokens: u32, failure: FailureKind) -> Self {
        Self { reached_end: false, steps, output_tokens, failure: Some(failure) }
    }
}

/// Distinct tallies of the three failure modes — never overlapping, so a Q4
/// model's "loop cap" failures don't hide its "fake done" failures.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FailureTracker {
    pub infinite_loop_hits: u32,
    pub hallucinated_completions: u32,
    pub malformed_json_calls: u32,
}

impl FailureTracker {
    fn record(&mut self, kind: FailureKind) {
        match kind {
            FailureKind::InfiniteLoop => self.infinite_loop_hits += 1,
            FailureKind::Hallucinated => self.hallucinated_completions += 1,
            FailureKind::Malformed => self.malformed_json_calls += 1,
        }
    }

    /// The most common failure mode (argmax). Ties resolve by severity order:
    /// infinite-loop > hallucinated > malformed. `None` when there were no
    /// failures at all.
    fn top(&self) -> TopError {
        [
            (self.infinite_loop_hits, TopError::InfiniteLoop),
            (self.hallucinated_completions, TopError::Hallucinated),
            (self.malformed_json_calls, TopError::MalformedJson),
        ]
        .into_iter()
        .fold((0u32, TopError::None), |best, (n, e)| if n > best.0 { (n, e) } else { best })
        .1
    }
}

/// The headline failure mode for a model's Comparison-Matrix row.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TopError {
    None,
    InfiniteLoop,
    Hallucinated,
    MalformedJson,
}

/// The Pass^k payload: how many of `total_runs` reached the end state, the
/// failure breakdown, the relative effort metric (mean output tokens over
/// successful runs only — `None` ⇒ the UI renders "N/A"), mean steps across all
/// runs, and the headline error.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct AgenticReport {
    pub passes: u32,
    pub total_runs: u32,
    pub failures: FailureTracker,
    pub avg_output_tokens_success: Option<f64>,
    pub avg_steps: Option<f64>,
    pub top_error: TopError,
}

impl AgenticReport {
    /// Fold the per-run outcomes of one Pass^k batch into the report.
    pub fn from_outcomes(outcomes: &[RunOutcome]) -> Self {
        let mut failures = FailureTracker::default();
        let mut passes = 0u32;
        let mut success_tokens: Vec<u32> = Vec::new();
        for o in outcomes {
            if o.reached_end {
                passes += 1;
                success_tokens.push(o.output_tokens);
            } else if let Some(f) = o.failure {
                failures.record(f);
            }
        }
        let steps: Vec<u32> = outcomes.iter().map(|o| o.steps).collect();
        AgenticReport {
            passes,
            total_runs: outcomes.len() as u32,
            top_error: failures.top(),
            failures,
            avg_output_tokens_success: mean(&success_tokens),
            avg_steps: mean(&steps),
        }
    }
}

/// Mean of the values, or `None` when empty — the single divide-by-zero guard
/// behind both effort and steps.
fn mean(xs: &[u32]) -> Option<f64> {
    (!xs.is_empty()).then(|| xs.iter().map(|&x| x as f64).sum::<f64>() / xs.len() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_error_picks_the_most_common_failure() {
        let mut f = FailureTracker::default();
        f.infinite_loop_hits = 1;
        f.hallucinated_completions = 3;
        assert_eq!(f.top(), TopError::Hallucinated);
    }

    #[test]
    fn top_error_is_none_with_no_failures() {
        assert_eq!(FailureTracker::default().top(), TopError::None);
    }

    #[test]
    fn top_error_breaks_ties_by_severity() {
        let mut f = FailureTracker::default();
        f.infinite_loop_hits = 2;
        f.hallucinated_completions = 2;
        assert_eq!(f.top(), TopError::InfiniteLoop); // tie → infinite-loop wins
    }

    #[test]
    fn effort_is_none_when_no_run_succeeds() {
        let outcomes =
            vec![RunOutcome::failure(4, 100, FailureKind::InfiniteLoop), RunOutcome::failure(2, 20, FailureKind::Hallucinated)];
        let r = AgenticReport::from_outcomes(&outcomes);
        assert_eq!(r.passes, 0);
        assert_eq!(r.avg_output_tokens_success, None); // divide-by-zero guard
        assert_eq!(r.avg_steps, Some(3.0)); // (4 + 2) / 2, across ALL runs
        assert_eq!(r.top_error, TopError::InfiniteLoop);
    }

    #[test]
    fn effort_averages_only_successful_runs() {
        let outcomes = vec![
            RunOutcome::success(2, 300),
            RunOutcome::success(2, 100),
            RunOutcome::failure(8, 1500, FailureKind::InfiniteLoop), // excluded from effort
        ];
        let r = AgenticReport::from_outcomes(&outcomes);
        assert_eq!(r.passes, 2);
        assert_eq!(r.total_runs, 3);
        assert_eq!(r.avg_output_tokens_success, Some(200.0)); // (300 + 100) / 2, NOT the 1500
    }
}
