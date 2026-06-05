//! Flat-file persistence for the Phase 7 readiness feature: editable profiles and
//! the last batch report per collection, keyed by a collision-proof filename so
//! long nested ids never truncate into colliding files. A concern sub-folder so
//! `persistence/` stays within the folder-taxonomy budget.
pub mod profiles;
pub mod reports;
pub mod safe_filename;
