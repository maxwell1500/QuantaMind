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

/// The per-turn output-token budget (`num_predict`). A non-thinking model gets the legacy
/// 256 cap — enough for a tool call, nothing wasted. A reasoning model emits a
/// `<think>…</think>` scratchpad BEFORE the call: at 256 tokens it is truncated mid-thought
/// and never emits the call (scored Malformed/Hallucinated), which is why a terse small model
/// can out-score a far larger reasoner for a purely structural reason. So when `is_thinking`,
/// the budget must clear the 1–2k tokens reasoning models routinely spend PLUS ~256 for the
/// call itself — anything tighter just re-creates the truncation bug at a higher number. Easy
/// is 1536 (not 1024) for exactly that reason: 1024 sits at the bottom of the scratchpad range.
/// Each tier scales up because a harder task reasons longer. Every value fits inside
/// `agentic_num_ctx` (Hard 14336 / Extreme 16384); because `<think>` is stripped before the
/// transcript append, the larger budget costs only one turn's generation buffer and never
/// accumulates across the step horizon.
pub const NON_THINKING_MAX_TOKENS: u32 = 256;

pub fn max_tokens_for(tier: Tier, is_thinking: bool) -> u32 {
    if !is_thinking {
        return NON_THINKING_MAX_TOKENS;
    }
    match tier {
        Tier::Easy => 1536,
        Tier::Medium => 2048,
        Tier::Hard => 3072,
        Tier::Extreme => 4096,
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

    #[test]
    fn non_thinking_budget_is_the_legacy_cap_at_every_tier() {
        for tier in [Tier::Easy, Tier::Medium, Tier::Hard, Tier::Extreme] {
            assert_eq!(max_tokens_for(tier, false), 256);
        }
    }

    #[test]
    fn thinking_budget_clears_the_scratchpad_range_and_scales_monotonically() {
        // Load-bearing numbers — every tier must exceed the 1–2k scratchpad reasoning
        // models spend, or the budget just re-creates the truncation bug it exists to fix.
        assert_eq!(max_tokens_for(Tier::Easy, true), 1536);
        assert_eq!(max_tokens_for(Tier::Medium, true), 2048);
        assert_eq!(max_tokens_for(Tier::Hard, true), 3072);
        assert_eq!(max_tokens_for(Tier::Extreme, true), 4096);
        // Even the smallest thinking budget clears the top of the 1–2k range plus the call.
        assert!(max_tokens_for(Tier::Easy, true) > 1024);
        assert!(max_tokens_for(Tier::Easy, true) < max_tokens_for(Tier::Extreme, true));
        // Thinking is strictly more generous than the terse cap at every tier.
        for tier in [Tier::Easy, Tier::Medium, Tier::Hard, Tier::Extreme] {
            assert!(max_tokens_for(tier, true) > max_tokens_for(tier, false));
        }
    }
}
