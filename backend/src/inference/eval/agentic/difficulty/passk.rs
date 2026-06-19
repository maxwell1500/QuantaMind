use crate::inference::eval::agentic::spec::Tier;

/// Pass^k scales with difficulty: a harder task demands more independent successes
/// to be credited. This is the cheapest re-separation lever for big models — τ-bench
/// shows top models cluster at pass^1 but spread at pass^8. `Easy = 5` is exactly
/// the pre-Phase-9 default, so an untiered task's k is unchanged.
///
/// Precedence at the call site (`build.rs`): an explicit `spec.k` (authored or the
/// UI K override) wins; only an absent `k` falls back to this tier policy.
pub fn pass_k_for(tier: Tier) -> u32 {
    match tier {
        Tier::Easy => 5,
        Tier::Medium => 8,
        Tier::Hard => 16,
        Tier::Extreme => 24,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn k_scales_monotonically_and_easy_matches_the_legacy_default() {
        assert_eq!(pass_k_for(Tier::Easy), 5); // == pre-Phase-9 AgenticConfig default
        assert_eq!(pass_k_for(Tier::Medium), 8);
        assert_eq!(pass_k_for(Tier::Hard), 16);
        assert_eq!(pass_k_for(Tier::Extreme), 24);
        assert!(pass_k_for(Tier::Easy) < pass_k_for(Tier::Extreme));
    }
}
