//! Stateful web-UI environment (Phase 2, Slice 3). The FIRST env whose actions MUTATE state:
//! `fill` / `toggle` / `navigate` / `click` / `submit` change a small JSON UI state machine, and
//! the run is graded on whether the agent drove the UI to a target end state (see
//! `EndStateRule::RequireEndState`). Unlike the stateless filesystem/corpus envs, the mutable
//! `WebUiState` is held in RUN scope (constructed fresh per run in the runner, like the per-run
//! fault `SandboxState`) — NEVER in the immutable shared `ResponderKind`, which holds only the
//! `WebUiSpec` (the initial state). `apply` is a pure function `(state, action) -> (state',
//! observation)`, so same actions ⇒ same final state ⇒ the visual replay can't disagree with the
//! grade. Built from a task's authored `world_state` (the initial UI state).

use crate::inference::eval::agentic::env_view::WebUiView;
use crate::inference::eval::toolcall::tasks::Call;
use serde_json::{json, Value};
use std::collections::HashSet;

/// UI-action tool names. Each MUTATES the state; aliases cover the natural names a model emits.
const FILL: &[&str] = &["fill", "set_field", "type", "enter"];
const TOGGLE: &[&str] = &["toggle", "check", "switch"];
const NAVIGATE: &[&str] = &["navigate", "goto", "go_to", "open"];
const CLICK: &[&str] = &["click", "press", "tap"];
const SUBMIT: &[&str] = &["submit", "confirm", "save"];
/// Read-only inspection: returns the current state without mutating.
const GET: &[&str] = &["get_state", "observe", "read_page", "view_page"];

/// The immutable web-UI spec carried in `ResponderKind::WebUi`: the initial state the per-run
/// `WebUiState` is cloned from. (No mutable data here — the responder is shared across all k runs.)
#[derive(Clone, Debug, PartialEq)]
pub struct WebUiSpec {
    initial: Value,
}

impl WebUiSpec {
    /// The authored initial UI state, e.g.
    /// `{ "route": "/cart", "fields": { "coupon": "" }, "toggles": { "gift": false }, "submitted": false }`.
    pub fn from_world_state(ws: &Value) -> Self {
        Self { initial: if ws.is_object() { ws.clone() } else { Value::Object(Default::default()) } }
    }
}

/// The per-RUN mutable UI state. Constructed fresh per run via `from_spec` (mirrors the per-run
/// fault `SandboxState`), mutated by `apply` on each UI action.
#[derive(Clone, Debug, PartialEq)]
pub struct WebUiState {
    state: Value,
}

impl WebUiState {
    pub fn from_spec(spec: &WebUiSpec) -> Self {
        Self { state: spec.initial.clone() }
    }

    /// Apply a UI action, MUTATING the state, and return the observation the model sees (the new
    /// UI state JSON). A recognized non-action acks `{"ok":true}`; an unrecognized (decoy) tool
    /// returns `None` so the runner injects its unknown-tool nudge. `recognized` is the task's
    /// real-tool whitelist (empty = legacy "all recognized").
    pub fn apply(&mut self, call: &Call, recognized: &HashSet<String>) -> Option<String> {
        let name = call.name.as_str();
        if FILL.contains(&name) {
            // Only DECLARED fields can be filled — naming a non-existent field returns an honest
            // error listing the available ones (never silently creates a phantom field that would
            // make the target unreachable while looking like success).
            let field = arg(call, &["field", "name", "target", "id"]);
            let value = call.args.get("value").or_else(|| call.args.get("text")).cloned().unwrap_or(Value::Null);
            if self.has_control("fields", &field) {
                self.set_section("fields", &field, value);
                Some(self.snapshot())
            } else {
                Some(self.unknown_control("field", "fields", &field))
            }
        } else if TOGGLE.contains(&name) {
            // Same contract as fill: only DECLARED toggles flip; an unknown name errors with the
            // available list (the fix for the phantom-`email_notifications` false-success).
            let nm = arg(call, &["name", "field", "target", "id"]);
            if self.has_control("toggles", &nm) {
                let cur = self.state.get("toggles").and_then(|t| t.get(&nm)).and_then(Value::as_bool).unwrap_or(false);
                self.set_section("toggles", &nm, Value::Bool(!cur));
                Some(self.snapshot())
            } else {
                Some(self.unknown_control("toggle", "toggles", &nm))
            }
        } else if NAVIGATE.contains(&name) {
            // Canonicalize to a leading-slash route so `navigate("settings")` and
            // `navigate("/settings")` are the same state (slash-pedantry isn't the skill).
            let route = arg(call, &["route", "to", "target", "url", "path"]);
            self.set_top("route", Value::String(canonical_route(&route)));
            Some(self.snapshot())
        } else if SUBMIT.contains(&name) {
            self.set_top("submitted", Value::Bool(true));
            Some(self.snapshot())
        } else if CLICK.contains(&name) {
            let target = arg(call, &["target", "button", "label", "id", "name"]);
            // Clicking a submit-like control also submits — a model often `click`s "Submit"
            // rather than calling a dedicated submit tool.
            if is_submitish(&target) {
                self.set_top("submitted", Value::Bool(true));
            }
            self.set_top("clicked", Value::String(target));
            Some(self.snapshot())
        } else if GET.contains(&name) {
            Some(self.snapshot()) // read-only inspection
        } else if recognized.is_empty() || recognized.contains(name) {
            Some(r#"{"ok":true}"#.to_string()) // recognized non-action: generic ack
        } else {
            None // decoy → runner nudges
        }
    }

    /// Exact-match grader (no partial credit): every key/path present in `target` must equal the
    /// current state's value (recursive on objects, exact on leaves). Extra state keys are ignored
    /// — the target specifies the GOAL fields, all of which must hold.
    pub fn matches(&self, target: &Value) -> bool {
        value_matches(target, &self.state)
    }

    /// The per-turn snapshot for the replay: the CURRENT (post-action) state + the last UI action
    /// and the widget it touched. Picks the turn's LAST UI-action call (so a `fill` batched before
    /// a `submit` still attributes the turn's focus correctly).
    pub fn view(&self, calls: &[Call]) -> WebUiView {
        let action_call = calls.iter().rev().find(|c| is_ui_action(&c.name));
        WebUiView {
            state: self.state.clone(),
            action: action_call.map(|c| c.name.clone()),
            focus: action_call.map(primary_arg),
        }
    }

    fn snapshot(&self) -> String {
        serde_json::to_string(&self.state).unwrap_or_else(|_| "{}".to_string())
    }

    /// Does the control `key` exist under `section` (fields/toggles) in the current state?
    fn has_control(&self, section: &str, key: &str) -> bool {
        self.state.get(section).and_then(|s| s.get(key)).is_some()
    }

    /// An honest error for an unknown control: names it and lists the available ones, so the model
    /// can self-correct instead of silently "succeeding" on a phantom key.
    fn unknown_control(&self, label: &str, section: &str, key: &str) -> String {
        let available: Vec<&String> =
            self.state.get(section).and_then(Value::as_object).map(|o| o.keys().collect()).unwrap_or_default();
        json!({ "error": format!("unknown {label} '{key}'"), "available": available }).to_string()
    }

    fn set_top(&mut self, key: &str, v: Value) {
        if !self.state.is_object() {
            self.state = Value::Object(Default::default());
        }
        if let Some(o) = self.state.as_object_mut() {
            o.insert(key.to_string(), v);
        }
    }

    fn set_section(&mut self, section: &str, key: &str, v: Value) {
        if !self.state.is_object() {
            self.state = Value::Object(Default::default());
        }
        let Some(o) = self.state.as_object_mut() else { return };
        let sec = o.entry(section.to_string()).or_insert_with(|| Value::Object(Default::default()));
        if !sec.is_object() {
            *sec = Value::Object(Default::default());
        }
        if let Some(so) = sec.as_object_mut() {
            so.insert(key.to_string(), v);
        }
    }
}

/// Recursive partial match: object target → every key must be present + match; leaf → exact equal.
fn value_matches(target: &Value, actual: &Value) -> bool {
    match target {
        Value::Object(t) => match actual.as_object() {
            Some(a) => t.iter().all(|(k, tv)| a.get(k).is_some_and(|av| value_matches(tv, av))),
            None => false,
        },
        other => other == actual,
    }
}

fn is_ui_action(name: &str) -> bool {
    FILL.contains(&name) || TOGGLE.contains(&name) || NAVIGATE.contains(&name) || CLICK.contains(&name) || SUBMIT.contains(&name) || GET.contains(&name)
}

/// Canonicalize a route to a single leading slash so `settings` and `/settings` are one state.
fn canonical_route(route: &str) -> String {
    let trimmed = route.trim();
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", trimmed.trim_start_matches('/'))
    }
}

fn is_submitish(target: &str) -> bool {
    let t = target.to_lowercase();
    ["submit", "confirm", "save", "place order", "checkout", "apply"].iter().any(|k| t.contains(k))
}

/// The first matching string arg under any of `keys`, else the first string arg, else "".
fn arg(call: &Call, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = call.args.get(*k).and_then(Value::as_str) {
            return s.to_string();
        }
    }
    call.args.as_object().and_then(|o| o.values().find_map(Value::as_str)).unwrap_or("").to_string()
}

/// The widget a UI action touched (for the replay's focus highlight).
fn primary_arg(call: &Call) -> String {
    arg(call, &["field", "name", "target", "route", "to", "button", "label", "id", "url", "path"])
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn spec() -> WebUiSpec {
        WebUiSpec::from_world_state(&json!({
            "route": "/cart",
            "fields": { "coupon": "" },
            "toggles": { "gift": false },
            "submitted": false
        }))
    }
    fn st() -> WebUiState {
        WebUiState::from_spec(&spec())
    }
    fn call(name: &str, args: Value) -> Call {
        Call { name: name.into(), args }
    }
    fn recognized() -> HashSet<String> {
        ["fill", "toggle", "navigate", "click", "submit", "get_state"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn fill_mutates_the_field_and_observation_shows_it() {
        let mut s = st();
        let obs = s.apply(&call("fill", json!({ "field": "coupon", "value": "SAVE10" })), &recognized());
        assert_eq!(s.state["fields"]["coupon"], json!("SAVE10"));
        // The observation the model sees IS the resulting state (never an empty ack).
        assert!(obs.unwrap().contains("SAVE10"));
    }

    #[test]
    fn toggle_flips_and_navigate_and_submit_mutate() {
        let mut s = st();
        s.apply(&call("toggle", json!({ "name": "gift" })), &recognized());
        assert_eq!(s.state["toggles"]["gift"], json!(true));
        s.apply(&call("navigate", json!({ "route": "/checkout" })), &recognized());
        assert_eq!(s.state["route"], json!("/checkout"));
        s.apply(&call("submit", json!({})), &recognized());
        assert_eq!(s.state["submitted"], json!(true));
    }

    #[test]
    fn navigate_canonicalizes_the_route_slash() {
        let mut s = st();
        s.apply(&call("navigate", json!({ "route": "checkout" })), &recognized());
        assert_eq!(s.state["route"], json!("/checkout")); // leading slash added
        let mut s2 = st();
        s2.apply(&call("navigate", json!({ "route": "/checkout" })), &recognized());
        assert_eq!(s2.state["route"], json!("/checkout")); // already-slashed unchanged → same state
    }

    #[test]
    fn unknown_field_or_toggle_errors_with_available_and_creates_no_phantom() {
        // The phantom-key fix: filling/toggling a non-existent control returns an honest error +
        // the available list, and does NOT create the key (which would look like success while the
        // real target stays unreachable — the `email_notifications` false-DONE bug).
        let mut s = st();
        let err = s.apply(&call("toggle", json!({ "name": "email_notifications" })), &recognized()).unwrap();
        assert!(err.contains("unknown toggle") && err.contains("gift"), "got: {err}");
        assert!(s.state["toggles"].get("email_notifications").is_none(), "must NOT create a phantom toggle");
        assert_eq!(s.state["toggles"]["gift"], json!(false)); // real toggle untouched
        // fill an undeclared field → same contract
        let ferr = s.apply(&call("fill", json!({ "field": "promo", "value": "X" })), &recognized()).unwrap();
        assert!(ferr.contains("unknown field") && ferr.contains("coupon"), "got: {ferr}");
        assert!(s.state["fields"].get("promo").is_none());
    }

    #[test]
    fn click_submit_button_also_submits() {
        let mut s = st();
        s.apply(&call("click", json!({ "target": "Submit" })), &recognized());
        assert_eq!(s.state["submitted"], json!(true));
        assert_eq!(s.state["clicked"], json!("Submit"));
    }

    #[test]
    fn recognized_non_action_acks_and_decoy_returns_none() {
        let mut s = st();
        // a recognized non-UI tool acks
        let rec: HashSet<String> = ["fill", "reply"].iter().map(|x| x.to_string()).collect();
        assert_eq!(s.apply(&call("reply", json!({ "text": "done" })), &rec).as_deref(), Some(r#"{"ok":true}"#));
        // delete_account is not whitelisted → decoy → None
        assert!(s.apply(&call("delete_account", json!({})), &rec).is_none());
    }

    #[test]
    fn matches_is_exact_partial_on_target_fields_no_partial_credit() {
        let mut s = st();
        let target = json!({ "fields": { "coupon": "SAVE10" }, "submitted": true });
        assert!(!s.matches(&target)); // nothing done yet
        s.apply(&call("fill", json!({ "field": "coupon", "value": "SAVE10" })), &recognized());
        assert!(!s.matches(&target)); // coupon set but not submitted — partial ≠ pass
        s.apply(&call("submit", json!({})), &recognized());
        assert!(s.matches(&target)); // both target fields hold → match
        // A wrong value fails exactly.
        assert!(!s.matches(&json!({ "fields": { "coupon": "WRONG" } })));
    }

    #[test]
    fn apply_is_deterministic_same_actions_same_final_state() {
        let actions = [
            call("fill", json!({ "field": "coupon", "value": "SAVE10" })),
            call("toggle", json!({ "name": "gift" })),
            call("submit", json!({})),
        ];
        let run = || {
            let mut s = st();
            for c in &actions {
                s.apply(c, &recognized());
            }
            s.state
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn view_carries_current_state_and_the_last_action() {
        let mut s = st();
        s.apply(&call("fill", json!({ "field": "coupon", "value": "SAVE10" })), &recognized());
        let v = s.view(&[
            call("fill", json!({ "field": "coupon", "value": "SAVE10" })),
            call("submit", json!({})),
        ]);
        assert_eq!(v.action.as_deref(), Some("submit"));
        assert_eq!(v.state["fields"]["coupon"], json!("SAVE10"));
    }
}
