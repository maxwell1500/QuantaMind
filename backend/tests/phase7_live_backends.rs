//! Phase 7 LIVE-backend suite — drives the real Ollama / llama.cpp / MLX servers
//! and real models through the app's own inference + eval + readiness code. Every
//! test is `#[ignore]` (it needs live servers + GB-scale models, so it never runs
//! in the normal `cargo test`). Run explicitly:
//!
//!   cargo test --test phase7_live_backends -- --ignored --nocapture
//!   cargo test --test phase7_live_backends live_ollama -- --ignored --nocapture
//!
//! Model paths default to this machine's layout and are overridable by env var.

use quantamind_lib::inference::backend::backend_kind::BackendKind;
use quantamind_lib::inference::backend::endpoint;
use quantamind_lib::inference::eval::agentic::report::{FailureTracker, TopError};
use quantamind_lib::inference::eval::batch::{AggAgentic, BatchColumn};
use quantamind_lib::inference::eval::readiness::inputs::verdict_for;
use quantamind_lib::inference::eval::readiness::profile::ReadinessProfile;
use quantamind_lib::inference::eval::readiness::recommend;
use quantamind_lib::inference::eval::readiness::types::{ModelVerdict, Readiness};
use quantamind_lib::inference::eval::toolcall::eval::run_eval;
use quantamind_lib::inference::eval::toolcall::tasks::{Call, Expected, ToolSchema, ToolTask};
use quantamind_lib::inference::ollama::ollama_chat::chat_with_tools;
use quantamind_lib::inference::ollama::ollama_show::probe_supports_tools;
use serde_json::{json, Value};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

// ── env-overridable model handles (defaults match this machine) ──────────────

fn home() -> String {
    std::env::var("HOME").unwrap()
}
fn ollama_tool_model() -> String {
    std::env::var("QM_OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2:3b".into())
}
fn ollama_notools_model() -> String {
    std::env::var("QM_OLLAMA_NOTOOLS").unwrap_or_else(|_| "gamma-2b-instruct-ft-awesome-chatgpt-prompts:q2_k".into())
}
fn llama_gguf() -> String {
    std::env::var("QM_LLAMA_GGUF").unwrap_or_else(|_| format!("{}/.quantamind/gguf/llama-3.2-1b-instruct_q8_0.gguf", home()))
}
fn mlx_model() -> String {
    std::env::var("QM_MLX_MODEL").unwrap_or_else(|_| format!("{}/.quantamind/mlx/mlx-community_Llama-3.2-1B-Instruct-4bit", home()))
}

fn weather_tools() -> Value {
    json!([{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a city",
            "parameters": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }
        }
    }])
}

fn weather_task() -> ToolTask {
    ToolTask {
        id: "weather".into(),
        category: "single".into(),
        prompt: "What is the weather in Paris? Call the tool.".into(),
        tools: vec![ToolSchema {
            name: "get_weather".into(),
            description: "Get the current weather for a city".into(),
            parameters: json!({ "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] }),
        }],
        expected: Expected::Call(Call { name: "get_weather".into(), args: json!({ "city": "Paris" }) }),
        agentic: None,
    }
}

fn profile(min_pass_k: f64) -> ReadinessProfile {
    ReadinessProfile {
        id: "live".into(),
        name: "Live coding agent".into(),
        min_pass_k,
        max_avg_steps: None,
        max_ms_per_step: None,
        min_context_tokens: None,
        forbid_infinite_loop: true,
        forbid_hallucinated_completion: true,
        require_full_vram: false,
        require_native_fc: false,
    }
}

fn called_weather_paris(name: &str, args: &Value) -> bool {
    name == "get_weather"
        && args
            .get("city")
            .and_then(|c| c.as_str())
            .map(|c| c.to_lowercase().contains("paris"))
            .unwrap_or(false)
}

// ── S3 — Ollama native function-calling against a REAL tool-capable model ─────

#[tokio::test]
#[ignore]
async fn live_ollama_native_tool_call_and_capability_probe() {
    let model = ollama_tool_model();
    let res = chat_with_tools(endpoint::OLLAMA, &model, "You are a helpful assistant.", "What is the weather in Paris? Call the tool.", &weather_tools(), None)
        .await
        .expect("native /api/chat call failed");
    println!("[ollama native FC] model={model} tool_calls={:?} content={:?}", res.tool_calls, res.content);
    assert!(!res.tool_calls.is_empty(), "expected a native tool_call from {model}");
    let tc = &res.tool_calls[0];
    assert!(called_weather_paris(&tc.name, &tc.args), "expected get_weather(Paris), got {}({})", tc.name, tc.args);

    // Capability probe: tool-capable model true, non-tool model false.
    let tools_ok = probe_supports_tools(endpoint::OLLAMA, &model).await;
    let notools = probe_supports_tools(endpoint::OLLAMA, &ollama_notools_model()).await;
    println!("[capability probe] {model}={tools_ok}  {}={notools}", ollama_notools_model());
    assert!(tools_ok, "{model} should report the tools capability");
    assert!(!notools, "{} should NOT report tools (N/A path)", ollama_notools_model());
}

// ── S1 — Ollama single-turn tool-calling eval (real scoring) ─────────────────

#[tokio::test]
#[ignore]
async fn live_ollama_toolcall_eval_scores_a_real_model() {
    let model = ollama_tool_model();
    let report = run_eval(BackendKind::Ollama, endpoint::OLLAMA, &model, &[weather_task()]).await.expect("run_eval failed");
    println!(
        "[ollama toolcall eval] model={model} n={} parse={:?} select={:?} arg={:?} composite={:?}",
        report.n, report.parse_rate, report.tool_selection_acc, report.arg_acc, report.composite
    );
    assert_eq!(report.n, 1);
    assert!(report.composite.is_some(), "a live run must yield a real composite score");
}

// ── S3→S1→S5 — real native pass^k feeds the REAL verdict + recommender ────────

#[tokio::test]
#[ignore]
async fn live_ollama_native_passk_drives_verdict_and_recommender() {
    let model = ollama_tool_model();
    let k = std::env::var("QM_K").ok().and_then(|s| s.parse().ok()).unwrap_or(5u32);
    let tools = weather_tools();
    let mut passes = 0u32;
    for i in 0..k {
        match chat_with_tools(endpoint::OLLAMA, &model, "You are a helpful assistant.", "What is the weather in Paris? Call the tool.", &tools, None).await {
            Ok(r) => {
                let ok = r.tool_calls.first().map(|t| called_weather_paris(&t.name, &t.args)).unwrap_or(false);
                if ok {
                    passes += 1;
                }
                println!("  run {i}: {} -> {:?}", if ok { "PASS" } else { "fail" }, r.tool_calls);
            }
            Err(e) => println!("  run {i}: ERROR {e}"),
        }
    }
    let pass_k = passes as f64 / k as f64;
    println!("[ollama native pass^k] model={model} passes={passes}/{k} pass_k={pass_k:.2}");

    // Build a real column from the measured native pass^k, then run the SAME
    // verdict + recommender the GUI/CLI use.
    let native = AggAgentic {
        passes,
        total_runs: k,
        avg_steps: Some(1.0),
        avg_output_tokens_success: Some(20.0),
        schema_resilience: None,
        top_error: TopError::None,
        failures: FailureTracker::default(),
    };
    let col = BatchColumn { model: model.clone(), backend: BackendKind::Ollama, toolcall: None, agentic: None, agentic_native_fc: Some(native), error: None };
    let p = profile(0.80);
    let v = verdict_for(&col, Some(true), false, &p);
    println!("[verdict @min_pass_k=0.80] {model} => {:?}  path={:?}  blocking={:?}", v.status, v.path, v.blocking);

    // Rank it next to two synthetic baselines to show the leaderboard logic on a real row.
    use quantamind_lib::inference::eval::readiness::types::{AgentPath, ReadinessVerdict};
    let mk = |m: &str, s: Readiness, eff: f64| ModelVerdict {
        model: m.into(),
        backend: BackendKind::Ollama,
        verdict: ReadinessVerdict { status: s, blocking: vec![], conditions: vec![], path: AgentPath::NativeFc },
        memory: None,
        avg_steps: Some(1.0),
        effort: Some(eff),
    };
    let mut board = vec![
        ModelVerdict { model: model.clone(), backend: BackendKind::Ollama, verdict: v.clone(), memory: None, avg_steps: Some(1.0), effort: Some(20.0) },
        mk("synthetic-notready", Readiness::NotReady, 10.0),
        mk("synthetic-ready-costly", Readiness::Ready, 999.0),
    ];
    recommend::rank(&mut board);
    let order: Vec<&str> = board.iter().map(|m| m.model.as_str()).collect();
    println!("[recommender leaderboard] {order:?}  -> recommended = {}", recommend::recommendation(&board).unwrap().model);

    assert!(passes >= 1, "a tool-capable model should pass at least once in {k} tries");
}

// ── llama.cpp — spawn the REAL server (app's own code) + generate ────────────

#[tokio::test]
#[ignore]
async fn live_llamacpp_spawn_and_generate() {
    use quantamind_lib::commands::llama::llama_runtime::{build_spawn_args, kill_server, spawn_server, wait_until_ready, PORT};
    use std::path::PathBuf;

    let gguf = llama_gguf();
    assert!(PathBuf::from(&gguf).exists(), "GGUF not found: {gguf}");
    // The app's dev resolution: <repo>/backend/binaries.
    let bin_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    assert!(bin_dir.join("llama-server").exists(), "llama-server not in {bin_dir:?}");

    let mut child = spawn_server(&bin_dir, &build_spawn_args(&gguf, PORT)).expect("spawn llama-server");
    println!("[llama.cpp] spawned pid={} on :{PORT} model={gguf}", child.id());

    let ready = wait_until_ready().await;
    if !ready {
        let _ = kill_server(&mut child);
        panic!("llama-server did not become ready on :{PORT}");
    }
    println!("[llama.cpp] /health OK");

    // llama-server `/completion` is a RAW completion endpoint (no chat template),
    // so use a completion-style prompt the model will continue.
    let mut out = String::new();
    let stats = quantamind_lib::inference::llama::llama::stream_generate(
        endpoint::LLAMA_SERVER,
        "", // single loaded model; name unused
        "The capital of France is",
        None,
        None,
        CancellationToken::new(),
        |t| out.push_str(t),
    )
    .await;
    let _ = kill_server(&mut child); // always reap
    let stats = stats.expect("llama.cpp /completion failed");
    println!("[llama.cpp] output={:?}  tokens={:?}", out.trim(), stats.eval_count);
    assert!(!out.trim().is_empty(), "llama.cpp produced no tokens");
}

// ── MLX — locate + spawn the REAL mlx_lm.server + generate ────────────────────

#[tokio::test]
#[ignore]
async fn live_mlx_spawn_and_generate() {
    use quantamind_lib::inference::mlx::server::mlx_endpoint::{mlx_endpoint, set_mlx_port};
    use quantamind_lib::inference::mlx::server::mlx_locate::locate;
    use quantamind_lib::inference::mlx::server::mlx_runtime::{build_spawn_args, find_available_port, kill_server, spawn_server};
    use std::path::PathBuf;

    let model = mlx_model();
    assert!(PathBuf::from(&model).exists(), "MLX model dir not found: {model}");
    let exe = locate(None).expect("mlx_lm.server not found in PATH/venvs");
    println!("[mlx] server exe = {exe:?}");
    let port = find_available_port(8082).expect("no free MLX port");
    set_mlx_port(port);

    let mut child = spawn_server(&exe, &build_spawn_args(&model, port)).expect("spawn mlx_lm.server");
    println!("[mlx] spawned pid={} on :{port} model={model}", child.id());

    // mlx_lm.server has no /health; poll by attempting a tiny generation (weights
    // load can take ~30–60s on first run).
    let ep = mlx_endpoint();
    let mut out = String::new();
    let mut ok = false;
    for attempt in 0..60 {
        tokio::time::sleep(Duration::from_secs(2)).await;
        out.clear();
        match quantamind_lib::inference::mlx::mlx::stream_generate(&ep, &model, "Reply with exactly one short sentence: say hello.", None, None, CancellationToken::new(), |t| out.push_str(t)).await {
            Ok(stats) if !out.trim().is_empty() => {
                println!("[mlx] ready after ~{}s  output={:?}  tokens={:?}", attempt * 2, out.trim(), stats.eval_count);
                ok = true;
                break;
            }
            Ok(_) => {} // up but empty — keep polling
            Err(_) => {} // not up yet
        }
    }
    let _ = kill_server(&mut child); // always reap
    assert!(ok, "MLX server never produced output for {model}");
}
