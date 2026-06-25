//! Frozen web-search-corpus environment (Phase 2). A deterministic, immutable document corpus
//! the agent browses with `search(query)` → ranked snippets and `fetch(doc)` → full text. Like
//! the filesystem env, getters return REAL content (or a deterministic not-found), and the env is
//! a pure function of the (immutable corpus + the call) — so the visual replay can never disagree
//! with the score. Search is COMPUTED (rank by query-term match), not a pre-baked exact-query
//! lookup, so a slightly-different query still works — mirroring how the fs env computes `grep`.
//! Built from a task's authored `world_state`: `{ "doc_id": { "title": …, "text": … }, … }`.

use crate::inference::eval::agentic::env_view::{CorpusDoc, CorpusHit, CorpusOp, CorpusView};
use crate::inference::eval::toolcall::tasks::Call;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};

/// Recognized search-tool names (any → ranked results). Mirrors the fs env's SEARCH alias set.
const SEARCH: &[&str] = &["search", "web_search", "search_docs"];
/// Recognized fetch-tool names (any → full doc text).
const FETCH: &[&str] = &["fetch", "fetch_doc", "open_doc", "read_doc"];
/// How many ranked hits a search returns.
const TOP_K: usize = 5;
/// Snippet fallback length when no line contains a query term (chars of the doc head).
const SNIPPET_HEAD: usize = 160;

/// One frozen document: a human title + its body text.
#[derive(Clone, Debug, PartialEq)]
struct Doc {
    title: String,
    text: String,
}

/// An immutable frozen corpus: `doc_id -> Doc`. `BTreeMap` so iteration (and thus ranking
/// tie-breaks + the index) is in stable `doc_id` order.
#[derive(Clone, Debug, PartialEq)]
pub struct CorpusState {
    docs: BTreeMap<String, Doc>,
}

impl CorpusState {
    /// Build from authored JSON: `{ "doc_id": { "title": "...", "text": "..." }, … }`. A bare
    /// string value (`"doc_id": "text"`) is shorthand for `{title: doc_id, text}`. Non-object,
    /// non-string values are stringified into `text`.
    pub fn from_world_state(ws: &Value) -> Self {
        let mut docs = BTreeMap::new();
        if let Some(obj) = ws.as_object() {
            for (id, val) in obj {
                let doc = match val {
                    Value::String(s) => Doc { title: id.clone(), text: s.clone() },
                    Value::Object(o) => Doc {
                        title: o.get("title").and_then(Value::as_str).unwrap_or(id).to_string(),
                        text: match o.get("text") {
                            Some(Value::String(s)) => s.clone(),
                            Some(other) => other.to_string(),
                            None => String::new(),
                        },
                    },
                    other => Doc { title: id.clone(), text: other.to_string() },
                };
                docs.insert(id.clone(), doc);
            }
        }
        Self { docs }
    }

    /// Deterministic tool result for a call, or `None` for an unrecognized (decoy) tool so the
    /// runner injects its unknown-tool nudge. `recognized` is the task's real-tool whitelist.
    pub fn respond(&self, call: &Call, recognized: &HashSet<String>) -> Option<String> {
        let name = call.name.as_str();
        if SEARCH.contains(&name) {
            Some(self.search(&query_arg(call)))
        } else if FETCH.contains(&name) {
            Some(self.fetch(&doc_arg(call)))
        } else if recognized.is_empty() || recognized.contains(name) {
            // A recognized non-getter (e.g. `reply`): generic ack, never a doc.
            Some(r#"{"ok":true}"#.to_string())
        } else {
            None
        }
    }

    /// The per-turn snapshot for the visual replay: the lazy index (id+title for every doc) plus
    /// the turn's search results OR fetched doc. Picks the turn's LAST corpus call (so a `search`
    /// or `fetch` batched before a `reply` still shows the corpus op, not the reply).
    pub fn view(&self, calls: &[Call]) -> CorpusView {
        let index = self.index();
        let Some(call) = calls.iter().rev().find(|c| is_corpus_op(&c.name)) else {
            return CorpusView { index, query: None, results: vec![], focus_doc: None, content: None, op: CorpusOp::None };
        };
        if SEARCH.contains(&call.name.as_str()) {
            let q = query_arg(call);
            let results = self.rank(&q);
            CorpusView { index, query: Some(q), results, focus_doc: None, content: None, op: CorpusOp::Search }
        } else {
            let id = doc_arg(call);
            CorpusView { index, query: None, results: vec![], focus_doc: Some(id.clone()), content: Some(self.fetch(&id)), op: CorpusOp::Fetch }
        }
    }

    // ---- getters (real content, deterministic) ----

    /// Ranked hits as the JSON the model sees: `[{ "doc_id", "title", "snippet" }, …]`.
    fn search(&self, query: &str) -> String {
        serde_json::to_string(&self.rank(query)).unwrap_or_else(|_| "[]".to_string())
    }

    /// Full document text, or a deterministic not-found (never an empty ack).
    fn fetch(&self, id: &str) -> String {
        match self.docs.get(id) {
            Some(doc) => doc.text.clone(),
            None => json!({ "error": "not found", "doc_id": id }).to_string(),
        }
    }

    /// Deterministic ranking: score = # of DISTINCT query terms present in `title+text`
    /// (case-insensitive); keep score>0; sort by score desc, ties broken by `doc_id` asc (stable
    /// sort over the `BTreeMap`'s id order); top-K, each with a snippet.
    fn rank(&self, query: &str) -> Vec<CorpusHit> {
        let terms = terms_of(query);
        if terms.is_empty() {
            return vec![];
        }
        let mut scored: Vec<(usize, &String, &Doc)> = self
            .docs
            .iter()
            .filter_map(|(id, doc)| {
                let hay = format!("{} {}", doc.title, doc.text).to_lowercase();
                let score = terms.iter().filter(|t| hay.contains(t.as_str())).count();
                (score > 0).then_some((score, id, doc))
            })
            .collect();
        // Stable sort by score desc → equal scores keep the BTreeMap's doc_id-asc order.
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored
            .into_iter()
            .take(TOP_K)
            .map(|(_, id, doc)| CorpusHit { doc_id: id.clone(), title: doc.title.clone(), snippet: snippet(&doc.text, &terms) })
            .collect()
    }

    /// The lazy corpus index — every doc's id + title (NO bodies), in `doc_id` order.
    fn index(&self) -> Vec<CorpusDoc> {
        self.docs.iter().map(|(id, doc)| CorpusDoc { doc_id: id.clone(), title: doc.title.clone() }).collect()
    }
}

/// Is this tool a corpus getter (drives the replay's per-turn op)?
fn is_corpus_op(name: &str) -> bool {
    SEARCH.contains(&name) || FETCH.contains(&name)
}

/// Distinct, lower-cased query terms in a stable order (sorted + deduped) so scoring is
/// deterministic.
fn terms_of(query: &str) -> Vec<String> {
    let mut terms: Vec<String> = query.to_lowercase().split_whitespace().map(str::to_string).collect();
    terms.sort();
    terms.dedup();
    terms
}

/// The snippet for a hit: the FIRST line (strictly top-to-bottom) containing any query term
/// (case-insensitive); if none, the doc head (first `SNIPPET_HEAD` chars of the trimmed text).
/// No per-line scoring / tie-break — strictly first-in-document-order, so it's a pure function.
fn snippet(text: &str, terms: &[String]) -> String {
    for line in text.lines() {
        let low = line.to_lowercase();
        if terms.iter().any(|t| low.contains(t.as_str())) {
            return line.trim().to_string();
        }
    }
    text.trim().chars().take(SNIPPET_HEAD).collect()
}

/// The search query of a call: `query`/`q`/`pattern`, else the first string arg.
fn query_arg(call: &Call) -> String {
    call.args
        .get("query")
        .or_else(|| call.args.get("q"))
        .or_else(|| call.args.get("pattern"))
        .and_then(Value::as_str)
        .or_else(|| call.args.as_object().and_then(|o| o.values().find_map(Value::as_str)))
        .unwrap_or("")
        .to_string()
}

/// The document id of a fetch call: `doc_id`/`doc`/`id`/`url`, else the first string arg.
fn doc_arg(call: &Call) -> String {
    call.args
        .get("doc_id")
        .or_else(|| call.args.get("doc"))
        .or_else(|| call.args.get("id"))
        .or_else(|| call.args.get("url"))
        .and_then(Value::as_str)
        .or_else(|| call.args.as_object().and_then(|o| o.values().find_map(Value::as_str)))
        .unwrap_or("")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::agentic::env_view::CorpusOp;
    use serde_json::json;

    fn corpus() -> CorpusState {
        CorpusState::from_world_state(&json!({
            "d_photo": { "title": "Photosynthesis", "text": "Plants convert light into energy.\nChlorophyll absorbs light.\n" },
            "d_resp": { "title": "Respiration", "text": "Cells release energy from glucose.\n" },
            "d_water": "Water is two hydrogen and one oxygen.",
        }))
    }
    fn call(name: &str, args: Value) -> Call {
        Call { name: name.into(), args }
    }
    fn recognized() -> HashSet<String> {
        ["search", "fetch", "reply"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn search_ranks_by_query_term_match_deterministically() {
        // "light energy" → d_photo (both terms) ranks above d_resp (only "energy"); d_water unmatched.
        let got = corpus().respond(&call("search", json!({ "query": "light energy" })), &recognized()).unwrap();
        let hits: Value = serde_json::from_str(&got).unwrap();
        let ids: Vec<&str> = hits.as_array().unwrap().iter().map(|h| h["doc_id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["d_photo", "d_resp"]);
        // The snippet is the first line containing a term.
        assert_eq!(hits[0]["snippet"], "Plants convert light into energy.");
    }

    #[test]
    fn fetch_returns_real_text_not_an_ack() {
        let got = corpus().respond(&call("fetch", json!({ "doc_id": "d_resp" })), &recognized());
        assert_eq!(got.as_deref(), Some("Cells release energy from glucose.\n"));
        // Bare-string shorthand doc.
        let w = corpus().respond(&call("fetch", json!({ "doc_id": "d_water" })), &recognized());
        assert_eq!(w.as_deref(), Some("Water is two hydrogen and one oxygen."));
    }

    #[test]
    fn fetch_missing_is_a_deterministic_not_found_never_empty() {
        let got = corpus().respond(&call("fetch", json!({ "doc_id": "nope" })), &recognized());
        assert_eq!(got.as_deref(), Some(r#"{"doc_id":"nope","error":"not found"}"#));
    }

    #[test]
    fn recognized_non_getter_acks_and_decoy_returns_none() {
        assert_eq!(corpus().respond(&call("reply", json!({ "text": "done" })), &recognized()).as_deref(), Some(r#"{"ok":true}"#));
        // edit_doc is not whitelisted → decoy → None (runner nudges).
        assert!(corpus().respond(&call("edit_doc", json!({ "doc_id": "d_photo" })), &recognized()).is_none());
    }

    #[test]
    fn view_carries_index_query_and_results_for_a_search() {
        let v = corpus().view(&[call("search", json!({ "query": "light" }))]);
        assert_eq!(v.op, CorpusOp::Search);
        assert_eq!(v.query.as_deref(), Some("light"));
        assert_eq!(v.results.iter().map(|h| h.doc_id.as_str()).collect::<Vec<_>>(), ["d_photo"]);
        // Lazy index: every doc id+title, no bodies, sorted by id.
        assert_eq!(v.index.iter().map(|d| d.doc_id.as_str()).collect::<Vec<_>>(), ["d_photo", "d_resp", "d_water"]);
        assert_eq!(v.content, None);
    }

    #[test]
    fn view_carries_full_content_for_a_fetch() {
        let v = corpus().view(&[call("fetch", json!({ "doc_id": "d_resp" }))]);
        assert_eq!(v.op, CorpusOp::Fetch);
        assert_eq!(v.focus_doc.as_deref(), Some("d_resp"));
        assert_eq!(v.content.as_deref(), Some("Cells release energy from glucose.\n"));
        assert!(v.results.is_empty());
    }

    #[test]
    fn view_picks_the_corpus_op_even_when_batched_before_a_reply() {
        let v = corpus().view(&[
            call("search", json!({ "query": "energy" })),
            call("reply", json!({ "text": "found it" })),
        ]);
        assert_eq!(v.op, CorpusOp::Search);
        assert_eq!(v.query.as_deref(), Some("energy"));
    }

    #[test]
    fn view_is_a_pure_function_identical_across_calls() {
        let c = [call("search", json!({ "query": "light energy" }))];
        assert_eq!(corpus().view(&c), corpus().view(&c));
    }

    #[test]
    fn snippet_falls_back_to_head_when_no_line_matches() {
        // "photosynthesis" matches the TITLE but no body LINE → snippet is the doc head (first
        // SNIPPET_HEAD chars of the trimmed text), here the whole short body.
        let hits = corpus().rank("photosynthesis");
        assert_eq!(hits[0].doc_id, "d_photo");
        assert_eq!(hits[0].snippet, "Plants convert light into energy.\nChlorophyll absorbs light.");
    }
}
