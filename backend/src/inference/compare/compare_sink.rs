use crate::inference::generate::generate_stats::GenerateStats;
use crate::metrics::timeline::TokenTiming;

/// Domain-level sink for compare-run events. The IPC layer implements this
/// by emitting Tauri events (`commands/compare_sink.rs`); the domain never
/// depends on the IPC layer — it depends on this trait. See
/// `docs/architecture.md#layering`. `Send + Sync` so a sink can cross `tokio::spawn`.
pub trait CompareSink: Send + Sync {
    fn loading(&self, model_id: &str, model: &str);
    fn token(&self, model_id: &str, model: &str, text: &str);
    fn done(
        &self,
        model_id: &str,
        model: &str,
        ttft_ms: Option<u64>,
        tokens_per_sec: Option<f64>,
        token_count: usize,
        timeline: &[TokenTiming],
        stats: &GenerateStats,
    );
    fn cancelled(&self, model_id: &str, model: &str, token_count: usize);
    fn error(&self, model_id: &str, model: &str, kind: &str, message: &str);
    fn run_done(&self);
}
