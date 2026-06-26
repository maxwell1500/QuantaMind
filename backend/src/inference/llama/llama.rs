use crate::errors::{AppError, AppResult};
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_stats::GenerateStats;
use crate::inference::http::http::{body_or_note, streaming_client};
use crate::inference::http::ndjson::next_line;
use crate::inference::llama::llama_wire::{
    strip_sse, ChatRequest, CompletionChunk, CompletionRequest,
};
use crate::inference::mlx::mlx_chunk::ChatChunk;
use crate::inference::mlx::mlx_stats::from_usage;
use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

/// Stream a generation from the bundled `llama-server`. Token text flows through
/// `on_token`; the call returns when the model stops or `cancel` fires.
///
/// PRIMARY path is the templated `/v1/chat/completions` endpoint: with `--jinja`
/// at spawn the server applies the GGUF's embedded chat template, so the model
/// sees its trained turn structure, emits EOS, and stops. The legacy
/// `/completion` endpoint (raw prompt, NO template — the original infinite-loop
/// path) is kept only as a 404 fallback for older builds. If neither route
/// exists, the server on this port almost certainly isn't ours (its `/health`
/// can still 200) — surface the likely port collision.
pub async fn stream_generate(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: Option<&str>,
    options: Option<GenerateOptions>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<GenerateStats> {
    let opts = options.filter(|o| !o.is_empty());
    if let Some(stats) = stream_chat(
        endpoint,
        model,
        prompt,
        system,
        opts.clone(),
        cancel.clone(),
        &mut on_token,
    )
    .await?
    {
        return Ok(stats);
    }
    if let Some(stats) =
        stream_completion(endpoint, prompt, system, opts, cancel, &mut on_token).await?
    {
        return Ok(stats);
    }
    Err(AppError::Inference(format!(
        "llama.cpp inference failed on {endpoint}: neither /v1/chat/completions nor \
         /completion is available. Another server is likely on this port — e.g. \
         mlx_lm.server (default 8080). Stop it (or run it on 8082), then Stop & Start llama.cpp."
    )))
}

/// Templated chat path. `Ok(None)` means the route 404'd (try the fallback);
/// any other failure propagates. A cancel mid-flight returns default stats.
async fn stream_chat(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: Option<&str>,
    opts: Option<GenerateOptions>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<Option<GenerateStats>> {
    let client = streaming_client()?;
    let body = ChatRequest::new(model.to_string(), prompt.to_string(), system, opts);
    let url = format!("{endpoint}/v1/chat/completions");
    // Race the request against cancel: a wedged server can accept the connection
    // but never send headers, blocking `.send()` — so Cancel must interrupt here.
    let send = client.post(&url).json(&body).send();
    let resp = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Ok(Some(GenerateStats::default())),
        r = send => r.map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                AppError::Timeout(format!("connect to llama-server {url}: {e}"))
            } else {
                AppError::Inference(format!("llama-server POST {url}: {e}"))
            }
        })?,
    };
    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        let body_text = body_or_note(resp).await;
        return Err(AppError::Inference(format!(
            "llama-server POST {url} → HTTP {status}: {body_text}"
        )));
    }

    let mut bytes = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut usage = None;
    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(Some(GenerateStats::default())),
            piece = bytes.next() => {
                let Some(piece) = piece else { break };
                let piece = piece.map_err(|e| AppError::Inference(e.to_string()))?;
                buf.extend_from_slice(&piece);
                while let Some(line) = next_line(&mut buf) {
                    let payload = strip_sse(&line);
                    if payload.is_empty() { continue; }
                    if payload == b"[DONE]" { return Ok(Some(from_usage(usage))); }
                    if payload.first() != Some(&b'{') { continue; }
                    let chunk: ChatChunk = serde_json::from_slice(payload)
                        .map_err(|e| AppError::Inference(format!("bad chunk: {e}")))?;
                    if chunk.usage.is_some() { usage = chunk.usage; }
                    if let Some(choice) = chunk.choices.into_iter().next() {
                        if let Some(text) = choice.delta.content.filter(|t| !t.is_empty()) {
                            on_token(&text);
                        }
                        if cancel.is_cancelled() { return Ok(Some(GenerateStats::default())); }
                        if choice.finish_reason.is_some() { return Ok(Some(from_usage(usage))); }
                    }
                }
            }
        }
    }
    Ok(Some(from_usage(usage)))
}

/// Legacy `/completion` fallback (raw prompt, no chat template). `Ok(None)` means
/// the route 404'd. System text is prepended to the prompt, as this endpoint
/// applies no template.
async fn stream_completion(
    endpoint: &str,
    prompt: &str,
    system: Option<&str>,
    opts: Option<GenerateOptions>,
    cancel: CancellationToken,
    mut on_token: impl FnMut(&str),
) -> AppResult<Option<GenerateStats>> {
    let client = streaming_client()?;
    let full = match system {
        Some(s) if !s.is_empty() => format!("{s}\n\n{prompt}"),
        _ => prompt.to_string(),
    };
    let body = CompletionRequest::new(full, opts);
    let url = format!("{endpoint}/completion");
    let resp = client.post(&url).json(&body).send().await.map_err(|e| {
        if e.is_timeout() || e.is_connect() {
            AppError::Timeout(format!("connect to llama-server {url}: {e}"))
        } else {
            AppError::Inference(format!("llama-server POST {url}: {e}"))
        }
    })?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
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
            _ = cancel.cancelled() => return Ok(Some(GenerateStats::default())),
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
                    if cancel.is_cancelled() { return Ok(Some(GenerateStats::default())); }
                    if chunk.stop {
                        return Ok(Some(chunk.timings.unwrap_or_default().stats()));
                    }
                }
            }
        }
    }
    Ok(Some(GenerateStats::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    /// The templated /v1/chat/completions endpoint is PRIMARY — when it answers,
    /// /completion is never hit (no `expect` on it, so a stray call would 501).
    #[tokio::test]
    async fn chat_endpoint_is_primary() {
        let mut s = Server::new_async().await;
        let _chat = s
            .mock("POST", "/v1/chat/completions")
            .with_status(200)
            .with_body("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"},\"finish_reason\":null}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n")
            .create_async()
            .await;
        let _completion = s.mock("POST", "/completion").expect(0).create_async().await;
        let mut out = String::new();
        stream_generate(
            &s.url(),
            "m",
            "p",
            None,
            None,
            CancellationToken::new(),
            |t| out.push_str(t),
        )
        .await
        .unwrap();
        assert_eq!(out, "hi");
        _completion.assert_async().await;
    }

    /// When the chat route 404s (older build), fall back to legacy /completion so
    /// the run still works.
    #[tokio::test]
    async fn falls_back_to_completion_when_chat_404s() {
        let mut s = Server::new_async().await;
        let _chat = s
            .mock("POST", "/v1/chat/completions")
            .with_status(404)
            .create_async()
            .await;
        let _c = s
            .mock("POST", "/completion")
            .with_status(200)
            .with_body("data: {\"content\":\"hi\",\"stop\":false}\n\ndata: {\"content\":\"\",\"stop\":true}\n\n")
            .create_async()
            .await;
        let mut out = String::new();
        stream_generate(
            &s.url(),
            "m",
            "p",
            None,
            None,
            CancellationToken::new(),
            |t| out.push_str(t),
        )
        .await
        .unwrap();
        assert_eq!(out, "hi");
    }

    /// When BOTH routes 404, the error points at the likely port collision
    /// (another server shadowing llama-server).
    #[tokio::test]
    async fn both_endpoints_404_surfaces_port_collision_hint() {
        let mut s = Server::new_async().await;
        let _chat = s
            .mock("POST", "/v1/chat/completions")
            .with_status(404)
            .create_async()
            .await;
        let _c = s
            .mock("POST", "/completion")
            .with_status(404)
            .create_async()
            .await;
        let err = stream_generate(
            &s.url(),
            "m",
            "p",
            None,
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("Another server is likely on"),
            "should hint at the collision: {msg}"
        );
    }

    /// A non-404 error on the primary chat route is surfaced with URL + status +
    /// body (no fallback) so the failure is self-explaining.
    #[tokio::test]
    async fn non_404_error_names_the_url_status_and_body() {
        let mut s = Server::new_async().await;
        let _m = s
            .mock("POST", "/v1/chat/completions")
            .with_status(500)
            .with_body("boom")
            .create_async()
            .await;
        let err = stream_generate(
            &s.url(),
            "m",
            "p",
            None,
            None,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("/v1/chat/completions"),
            "should name the URL: {msg}"
        );
        assert!(msg.contains("500"), "should name the status: {msg}");
        assert!(msg.contains("boom"), "should include the body: {msg}");
    }
}
