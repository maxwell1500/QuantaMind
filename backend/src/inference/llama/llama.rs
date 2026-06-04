use crate::errors::{AppError, AppResult};
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::http::http::{body_or_note, streaming_client};
use crate::inference::http::ndjson::next_line;
use crate::inference::llama::llama_wire::{strip_sse, CompletionChunk, CompletionRequest};
use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

/// Stream a generation from a `llama-server` `/completion` endpoint. The server
/// is single-model (fixed at spawn), so the model name isn't part of the native
/// request. Mirrors `ollama::stream_generate`: token text flows through
/// `on_token`, and the call returns when the model stops or `cancel` fires.
///
/// Robustness: if `/completion` returns 404 (a newer llama-server build, or some
/// other OpenAI-compatible server answering on this port), fall back to the
/// OpenAI-compatible `/v1/chat/completions` so the run still works. `model` is
/// carried only for that fallback body.
pub async fn stream_generate(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: Option<&str>,
    options: Option<GenerateOptions>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<GenerateStats> {
    let client = streaming_client()?;
    let full = match system {
        Some(s) if !s.is_empty() => format!("{s}\n\n{prompt}"),
        _ => prompt.to_string(),
    };
    let opts = options.filter(|o| !o.is_empty());
    let body = CompletionRequest::new(full, opts.clone());
    let url = format!("{endpoint}/completion");
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                AppError::Timeout(format!("connect to llama-server {url}: {e}"))
            } else {
                AppError::Inference(format!("llama-server POST {url}: {e}"))
            }
        })?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        // No native /completion route here — try the OpenAI-compatible endpoint.
        // If THAT also fails, the server on this port is almost certainly not the
        // llama-server we started (its /health can still 200) — point the user at
        // the likely port collision.
        return crate::inference::mlx::mlx::stream_generate(
            endpoint, model, prompt, system, opts, cancel, on_token,
        )
        .await
        .map_err(|e| AppError::Inference(format!(
            "llama.cpp inference failed on {endpoint}: neither /completion nor \
             /v1/chat/completions is available ({e}). Another server is likely on \
             this port — e.g. mlx_lm.server (default 8080). Stop it (or run it on \
             8082), then Stop & Start llama.cpp."
        )));
    }
    if !status.is_success() {
        let body_text = body_or_note(resp).await;
        return Err(AppError::Inference(format!(
            "llama-server POST {url} → HTTP {status}: {body_text}"
        )));
    }

    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(GenerateStats::default()),
            piece = bytes.next() => {
                let Some(piece) = piece else { break };
                let piece = piece.map_err(|e| AppError::Inference(e.to_string()))?;
                buf.extend_from_slice(&piece);
                while let Some(line) = next_line(&mut buf) {
                    let payload = strip_sse(&line);
                    if payload.is_empty() || payload == b"[DONE]" { continue; }
                    let chunk: CompletionChunk = serde_json::from_slice(payload)
                        .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
                    if !chunk.content.is_empty() {
                        on_token(&chunk.content);
                    }
                    if cancel.is_cancelled() { return Ok(GenerateStats::default()); }
                    if chunk.stop {
                        return Ok(chunk.timings.unwrap_or_default().stats());
                    }
                }
            }
        }
    }
    Ok(GenerateStats::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    /// When /completion 404s, fall back to the OpenAI-compatible
    /// /v1/chat/completions so a run on this port still works.
    #[tokio::test]
    async fn falls_back_to_openai_chat_when_completion_404s() {
        let mut s = Server::new_async().await;
        let _c = s.mock("POST", "/completion").with_status(404).with_body("Not Found").create_async().await;
        let _chat = s
            .mock("POST", "/v1/chat/completions")
            .with_status(200)
            .with_body("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"},\"finish_reason\":null}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
            .create_async()
            .await;
        let mut out = String::new();
        stream_generate(&s.url(), "m", "p", None, None, CancellationToken::new(), |t| out.push_str(t))
            .await
            .unwrap();
        assert_eq!(out, "hi");
    }

    /// When BOTH /completion and the OpenAI fallback 404, the error points at the
    /// likely port collision (another server shadowing llama-server).
    #[tokio::test]
    async fn both_endpoints_404_surfaces_port_collision_hint() {
        let mut s = Server::new_async().await;
        let _c = s.mock("POST", "/completion").with_status(404).create_async().await;
        let _chat = s.mock("POST", "/v1/chat/completions").with_status(404).create_async().await;
        let err = stream_generate(&s.url(), "m", "p", None, None, CancellationToken::new(), |_| {})
            .await
            .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("Another server is likely on"), "should hint at the collision: {msg}");
    }

    /// A non-404 error on /completion is surfaced with its URL + status + body
    /// (no fallback) so the failure is self-explaining.
    #[tokio::test]
    async fn non_404_error_names_the_url_status_and_body() {
        let mut s = Server::new_async().await;
        let _m = s.mock("POST", "/completion").with_status(500).with_body("boom").create_async().await;
        let err = stream_generate(&s.url(), "m", "p", None, None, CancellationToken::new(), |_| {})
            .await
            .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("/completion"), "should name the URL: {msg}");
        assert!(msg.contains("500"), "should name the status: {msg}");
        assert!(msg.contains("boom"), "should include the body: {msg}");
    }
}
