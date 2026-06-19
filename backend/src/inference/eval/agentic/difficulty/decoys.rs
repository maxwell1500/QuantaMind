use crate::inference::eval::toolcall::tasks::ToolSchema;
use std::collections::HashSet;
use std::sync::OnceLock;

/// A built-in pool of plausible-but-wrong agent tools. A decoy is never an
/// `expected` checkpoint and never has a mock, so calling one can never satisfy the
/// end state — it just wastes a step (the runner injects "Tool not found"). Decoys
/// raise difficulty WITHOUT touching grading: the oracle is the unchanged
/// `end_state`. Lazily built once because `ToolSchema::parameters` is a runtime
/// `serde_json::Value` (not const-constructible).
pub fn decoy_pool() -> &'static [ToolSchema] {
    static POOL: OnceLock<Vec<ToolSchema>> = OnceLock::new();
    POOL.get_or_init(build_pool).as_slice()
}

/// Present the real tools with `n` deterministically-chosen decoys shuffled in.
/// Same `(real, n, seed)` → identical result (temp-0 / reproducibility contract).
/// Decoys whose name collides with a real tool are excluded so a decoy can never
/// shadow an expected tool; `n` is capped at the number of distinct decoys
/// available. `n == 0` returns the real tools unchanged (order preserved), so a
/// task with no decoy axis is byte-identical to pre-Phase-9 behavior.
pub fn merge_decoys(real: &[ToolSchema], n: u32, seed: u64) -> Vec<ToolSchema> {
    if n == 0 {
        return real.to_vec();
    }
    let real_names: HashSet<&str> = real.iter().map(|t| t.name.as_str()).collect();
    let mut candidates: Vec<ToolSchema> =
        decoy_pool().iter().filter(|d| !real_names.contains(d.name.as_str())).cloned().collect();

    let mut rng = seed;
    shuffle(&mut candidates, &mut rng);
    candidates.truncate((n as usize).min(candidates.len()));

    let mut out = real.to_vec();
    out.append(&mut candidates);
    shuffle(&mut out, &mut rng); // intersperse decoys among the real tools
    out
}

/// SplitMix64 — a tiny, dependency-free, fully deterministic PRNG. The `rand`
/// crate is intentionally not a dependency (locked stack); this is sufficient for a
/// seeded shuffle and keeps the decoy set reproducible across machines.
fn next_rand(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Deterministic in-place Fisher–Yates using `next_rand`.
fn shuffle<T>(items: &mut [T], state: &mut u64) {
    if items.len() < 2 {
        return;
    }
    for i in (1..items.len()).rev() {
        let j = (next_rand(state) % (i as u64 + 1)) as usize;
        items.swap(i, j);
    }
}

fn decoy(name: &str, description: &str) -> ToolSchema {
    ToolSchema {
        name: name.into(),
        description: description.into(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": { "query": { "type": "string" } }
        }),
    }
}

fn build_pool() -> Vec<ToolSchema> {
    [
        ("web_search", "Search the public web for a query string."),
        ("send_email", "Send an email to a recipient."),
        ("read_file", "Read the contents of a file by path."),
        ("write_file", "Write contents to a file by path."),
        ("delete_file", "Delete a file by path."),
        ("list_directory", "List the entries of a directory."),
        ("run_shell", "Execute a shell command and return its output."),
        ("get_weather", "Get the current weather for a location."),
        ("translate_text", "Translate text into a target language."),
        ("summarize_text", "Summarize a block of text."),
        ("create_calendar_event", "Create a calendar event."),
        ("query_database", "Run a read query against a database."),
        ("http_request", "Make an arbitrary HTTP request to a URL."),
        ("take_screenshot", "Capture a screenshot of the screen."),
        ("convert_currency", "Convert an amount between currencies."),
        ("geocode_address", "Resolve an address to coordinates."),
        ("set_reminder", "Set a reminder for a future time."),
        ("parse_csv", "Parse a CSV document into rows."),
        ("generate_image", "Generate an image from a text prompt."),
        ("fetch_stock_price", "Fetch the latest price for a ticker."),
    ]
    .into_iter()
    .map(|(n, d)| decoy(n, d))
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tool(name: &str) -> ToolSchema {
        ToolSchema { name: name.into(), description: "real".into(), parameters: json!({}) }
    }

    #[test]
    fn n_zero_returns_the_real_tools_unchanged() {
        let real = vec![tool("get_balance"), tool("transfer")];
        let out = merge_decoys(&real, 0, 42);
        assert_eq!(out, real); // order and contents byte-identical
    }

    #[test]
    fn adds_exactly_n_decoys_none_colliding_with_real_tools() {
        let real = vec![tool("get_balance"), tool("transfer")];
        let out = merge_decoys(&real, 5, 7);
        assert_eq!(out.len(), real.len() + 5);
        // Every real tool is still present...
        for r in &real {
            assert!(out.iter().any(|t| t.name == r.name));
        }
        // ...and the 5 extras are all from the decoy pool, none shadowing a real name.
        let pool: HashSet<&str> = decoy_pool().iter().map(|t| t.name.as_str()).collect();
        let extras: Vec<&ToolSchema> = out.iter().filter(|t| !real.iter().any(|r| r.name == t.name)).collect();
        assert_eq!(extras.len(), 5);
        assert!(extras.iter().all(|t| pool.contains(t.name.as_str())));
    }

    #[test]
    fn same_seed_is_deterministic_different_seed_differs() {
        let real = vec![tool("a")];
        let a = merge_decoys(&real, 6, 123);
        let b = merge_decoys(&real, 6, 123);
        let c = merge_decoys(&real, 6, 999);
        assert_eq!(a, b); // reproducible: identical presented order
        let names_a: Vec<&str> = a.iter().map(|t| t.name.as_str()).collect();
        let names_c: Vec<&str> = c.iter().map(|t| t.name.as_str()).collect();
        assert_ne!(names_a, names_c); // a different seed reshuffles/repicks
    }

    #[test]
    fn a_decoy_pool_name_never_collides_with_a_real_tool_of_the_same_name() {
        // If the real task already declares `web_search`, the decoy `web_search` is
        // excluded so it can't shadow the real (mockable) tool.
        let real = vec![tool("web_search")];
        let out = merge_decoys(&real, 3, 5);
        let web_search_count = out.iter().filter(|t| t.name == "web_search").count();
        assert_eq!(web_search_count, 1); // the real one only
    }

    #[test]
    fn n_above_pool_size_is_capped_not_duplicated() {
        let real = vec![tool("x")];
        let out = merge_decoys(&real, 1000, 1);
        // real + entire (distinct) pool, never more.
        assert_eq!(out.len(), real.len() + decoy_pool().len());
        let names: HashSet<&str> = out.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names.len(), out.len()); // no duplicates
    }
}
