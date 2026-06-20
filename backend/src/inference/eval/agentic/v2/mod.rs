//! Phase 9-v2: the authored tiered-scenario engine. A v2 collection (one JSON
//! object with `world_state` discovery, wildcard `expected_calls`, `must_not_call`
//! traps) transpiles into the existing `ToolTask`/`AgenticSpec` and runs on the
//! UNCHANGED agentic runner — no second execution path.
pub mod collection;
pub mod generator;
pub mod r#match;
pub mod scenarios;
pub mod transpile;
pub mod world_state;
