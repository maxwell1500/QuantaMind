// Publish identity/auth concern (PKCE + token vault + browser sign-in). The whole
// subfolder is gated behind `not(feature = "enterprise")` at the parent, so no
// per-module cfg is needed here. The cached access-token `AuthState` lives one
// level up (un-gated) so `lib.rs` can `.manage()` it in every build.
pub mod auth;
pub mod login_cmd;
pub mod pkce;
pub mod token;
