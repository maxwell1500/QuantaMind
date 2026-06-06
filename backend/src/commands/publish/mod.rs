// Phase 8 publish + community commands. The offline share export (`export_cmd`)
// ships in every build; the auth/send flow lands here later behind the
// `enterprise` feature gate: the auth + publish surface compiles OUT of
// enterprise/air-gapped builds; the offline `export_cmd` stays IN every build.
pub mod export_cmd;

#[cfg(not(feature = "enterprise"))]
pub mod auth;
#[cfg(not(feature = "enterprise"))]
pub mod cohort;
#[cfg(not(feature = "enterprise"))]
pub mod preview_cmd;
