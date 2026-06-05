use serde::{Deserialize, Serialize};

/// A use-case preset the verdict is measured *against* — user-tunable, never
/// hardcoded thresholds. Hard requirements (`require_*`, `min_*`) block when a
/// model breaches them OR when the metric was never measured (ignorance is not a
/// pass). Soft targets (`max_*`) only downgrade a verdict to Conditional.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ReadinessProfile {
    /// Stable id used as the persistence key (one flat JSON file per profile).
    pub id: String,
    /// Human label shown in the picker, e.g. "Coding agent".
    pub name: String,
    /// Hard gate: required Pass^k. A model whose Pass^k is below this — or was
    /// never measured — is NotReady.
    pub min_pass_k: f64,
    /// Soft target: mean agent steps. Over this → Conditional ("inefficient").
    pub max_avg_steps: Option<f64>,
    /// Soft target: ms per step. Over this → Conditional ("slow").
    pub max_ms_per_step: Option<u64>,
    /// Hard gate when `Some`: required context headroom before the reasoning
    /// cliff. Below it — or unmeasured — is NotReady. `None` ⇒ metric ignored.
    pub min_context_tokens: Option<u32>,
    /// Hard gate: any infinite-loop run is NotReady.
    pub forbid_infinite_loop: bool,
    /// Hard gate: any hallucinated-completion run is NotReady.
    pub forbid_hallucinated_completion: bool,
    /// Hard gate: a partially-offloaded (or unmeasured) model is NotReady.
    pub require_full_vram: bool,
    /// Hard gate: native tool-calling must be measured & supported, else NotReady.
    /// Built-ins ship this `false` until Phase 7.2 lands the native-FC path.
    pub require_native_fc: bool,
}

/// The shipped presets, written to disk on first run as editable copies. They
/// gate only on metrics the engine measures *today* (Pass^k, the loop/
/// hallucination taxonomy, mean steps). The hard infra gates `require_full_vram`
/// and `min_context_tokens` stay off here — with strict null-gating an
/// unmeasured requirement blocks, which would make every model NotReady for
/// infra reasons until 7.2/7.4 wire VRAM fit and the context cliff. Power users
/// can switch them on in a custom profile and get exactly that strict behaviour.
pub fn builtins() -> Vec<ReadinessProfile> {
    vec![
        ReadinessProfile {
            id: "coding-agent".into(),
            name: "Coding agent".into(),
            min_pass_k: 0.80,
            max_avg_steps: Some(8.0),
            max_ms_per_step: Some(5000),
            min_context_tokens: None,
            forbid_infinite_loop: true,
            forbid_hallucinated_completion: true,
            require_full_vram: false,
            require_native_fc: false,
        },
        ReadinessProfile {
            id: "rag-assistant".into(),
            name: "RAG assistant".into(),
            min_pass_k: 0.70,
            max_avg_steps: Some(5.0),
            max_ms_per_step: Some(8000),
            min_context_tokens: None,
            forbid_infinite_loop: true,
            forbid_hallucinated_completion: true,
            require_full_vram: false,
            require_native_fc: false,
        },
        ReadinessProfile {
            id: "general-agent".into(),
            name: "General agent".into(),
            min_pass_k: 0.60,
            max_avg_steps: None,
            max_ms_per_step: None,
            min_context_tokens: None,
            forbid_infinite_loop: true,
            forbid_hallucinated_completion: false,
            require_full_vram: false,
            require_native_fc: false,
        },
    ]
}
