//! Context-cliff probe (Tauri-free). Pads a tool-call task to growing verified
//! token depths, injects the instruction at swept positions, and reports the
//! largest context where accuracy still holds. The command layer wraps this with
//! events + persistence; the engine here has no UI dependency.

pub mod engine;
pub mod padding;
pub mod presets;

pub use engine::{
    build_ladder, run_cliff, run_cliff_with, single_turn_tasks, CliffPoint, CliffReport, DepthScore, FailureSample, DEFAULT_DEPTHS,
};
pub use presets::{CliffPreset, CliffSource};
