use crate::inference::vram_math::calculate_kv_cache_bytes;
use serde::{Deserialize, Serialize};

/// A model fits but sits at/above this fraction of the cap → flag VRAM pressure
/// (a soft Conditional, not a block). Mirrors the `fit.ts` "tight" precedent.
pub const PRESSURE_FRACTION: f64 = 0.85;

/// One model's measured memory footprint against an allocation cap: exact on-disk
/// weights + the real f16 KV cache at the run's context length. Never an estimate
/// of the weights — only the cache uses the canonical formula.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryProfile {
    pub weights_bytes: u64,
    pub kv_cache_bytes: u64,
    pub total_bytes: u64,
    pub cap_bytes: u64,
    pub context_length: u32,
    pub fits: bool,
    pub pressure: bool,
}

/// Pure VRAM-fit estimate: weights + KV cache (via the canonical `vram_math`
/// formula) vs the cap. `fits` = total ≤ cap; `pressure` = fits but ≥85% of the
/// cap. Takes dimension primitives (not `commands`' `ModelDims`) so `inference/`
/// stays Tauri-free and the future CLI shares the same math.
pub fn estimate(
    weights_bytes: u64,
    layers: u64,
    head_count: u64,
    head_count_kv: u64,
    embedding_length: u64,
    context_length: u32,
    cap_bytes: u64,
) -> MemoryProfile {
    let kv_cache_bytes =
        calculate_kv_cache_bytes(layers, head_count, head_count_kv, embedding_length, context_length as u64);
    let total_bytes = weights_bytes.saturating_add(kv_cache_bytes);
    let fits = total_bytes <= cap_bytes;
    let pressure = fits && cap_bytes > 0 && total_bytes as f64 >= cap_bytes as f64 * PRESSURE_FRACTION;
    MemoryProfile { weights_bytes, kv_cache_bytes, total_bytes, cap_bytes, context_length, fits, pressure }
}

#[cfg(test)]
#[path = "vram_fit_tests.rs"]
mod tests;
