use serde::Deserialize;

/// Every bundled v2 tiered scenario collection: `(id, raw JSON)`. The id is the
/// file stem; the collection's domain + tier come from the JSON header. These are
/// THE eval content — they replace the old hand-coded single/multi fixtures.
pub const V2_SCENARIOS: &[(&str, &str)] = &[
    ("easy-coding", include_str!("scenarios/easy-coding.json")),
    ("easy-customer-support", include_str!("scenarios/easy-customer-support.json")),
    ("easy-ecommerce", include_str!("scenarios/easy-ecommerce.json")),
    ("easy-finance", include_str!("scenarios/easy-finance.json")),
    ("easy-math-science", include_str!("scenarios/easy-math-science.json")),
    ("medium-coding", include_str!("scenarios/medium-coding.json")),
    ("medium-customer-support", include_str!("scenarios/medium-customer-support.json")),
    ("medium-ecommerce", include_str!("scenarios/medium-ecommerce.json")),
    ("medium-finance", include_str!("scenarios/medium-finance.json")),
    ("medium-legal", include_str!("scenarios/medium-legal.json")),
    ("medium-medical", include_str!("scenarios/medium-medical.json")),
    ("hard-coding", include_str!("scenarios/hard-coding.json")),
    ("hard-finance", include_str!("scenarios/hard-finance.json")),
    ("hard-finance-2", include_str!("scenarios/hard-finance-2.json")),
    ("hard-medical", include_str!("scenarios/hard-medical.json")),
    ("hard-support-ecommerce", include_str!("scenarios/hard-support-ecommerce.json")),
    ("extreme-clinical-trial-stats", include_str!("scenarios/extreme-clinical-trial-stats.json")),
    ("extreme-legal-compliance", include_str!("scenarios/extreme-legal-compliance.json")),
    ("extreme-supply-chain-recon", include_str!("scenarios/extreme-supply-chain-recon.json")),
];

/// Raw JSON for a bundled v2 collection by id.
pub fn v2_json(id: &str) -> Option<&'static str> {
    V2_SCENARIOS.iter().find(|(i, _)| *i == id).map(|(_, j)| *j)
}

/// Lightweight collection header for the picker (domain + tier), without
/// transpiling every task.
#[derive(Deserialize)]
pub struct V2Header {
    #[serde(default)]
    pub domain: String,
    #[serde(default)]
    pub tier: String,
}

pub fn v2_header(json: &str) -> Option<V2Header> {
    serde_json::from_str(json).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::v2::collection::load_v2_collection;

    #[test]
    fn every_bundled_v2_collection_loads_and_validates() {
        assert_eq!(V2_SCENARIOS.len(), 19);
        for (id, json) in V2_SCENARIOS {
            let tasks = load_v2_collection(json).unwrap_or_else(|e| panic!("collection '{id}' failed to load: {e}"));
            assert!(!tasks.is_empty(), "collection '{id}' has no tasks");
            // Every bundled task routes through the agentic engine.
            assert!(tasks.iter().all(|t| t.category == "agent_loop"), "collection '{id}' must be all agent_loop");
            // The header parses (domain + tier for the picker).
            let h = v2_header(json).unwrap_or_else(|| panic!("collection '{id}' header unparseable"));
            assert!(!h.domain.is_empty() && !h.tier.is_empty(), "collection '{id}' missing domain/tier");
        }
    }
}
