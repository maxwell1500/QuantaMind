use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BenchModel {
    pub name: String,
    #[serde(default)]
    pub size_bytes: u64,
}

/// A saved Bench setup: which models to compare, the run strategy, and the
/// prompt. Persisted as `<name>.bench.yaml` in the open workspace.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BenchConfig {
    pub name: String,
    #[serde(default)]
    pub models: Vec<BenchModel>,
    #[serde(default)]
    pub strategy: String,
    #[serde(default)]
    pub system: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}
