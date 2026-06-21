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

/// The agentic step budget scales with difficulty: a harder task has a longer horizon
/// (more checkpoints, prereqs, decoys), so it needs room to work before the loop cap
/// fires. `Easy = 8` matches the pre-Phase-9 UI default, so an Easy/untiered run is
/// unchanged. Chosen so each tier's window stays within the memory-safe `num_ctx`
/// ceiling (`agentic_num_ctx`): 8/16/32/48 → 5120/8192/14336/16384 tokens, the last at
/// the clamp — past ~38 steps `num_ctx` is pinned at the ceiling anyway, so `Extreme`'s
/// extra budget buys deeper trajectories without inflating the KV cache further.
///
/// Same precedence as `k` (`build.rs`): an explicit `spec.max_steps` (authored or the UI
/// Max-Steps field) wins; only an absent value falls back to this tier policy.
pub fn max_steps_for(tier: Tier) -> u32 {
    match tier {
        Tier::Easy => 8,
        Tier::Medium => 16,
        Tier::Hard => 32,
        Tier::Extreme => 48,
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

    #[test]
    fn max_steps_scales_monotonically_and_easy_matches_the_legacy_ui_default() {
        assert_eq!(max_steps_for(Tier::Easy), 8); // == the pre-Phase-9 UI default
        assert_eq!(max_steps_for(Tier::Medium), 16);
        assert_eq!(max_steps_for(Tier::Hard), 32);
        assert_eq!(max_steps_for(Tier::Extreme), 48);
        assert!(max_steps_for(Tier::Easy) < max_steps_for(Tier::Extreme));
    }
}
