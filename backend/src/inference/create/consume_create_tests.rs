use super::*;
use bytes::Bytes;
use futures_util::stream;

fn s(chunks: Vec<&'static [u8]>) -> impl Stream<Item = Result<Bytes, String>> {
    stream::iter(
        chunks
            .into_iter()
            .map(|b| Ok::<Bytes, String>(Bytes::from_static(b))),
    )
}

#[tokio::test]
async fn success_line_with_trailing_newline_returns_ok() {
    consume_stream(s(vec![b"{\"status\":\"success\"}\n"]))
        .await
        .unwrap();
}

#[tokio::test]
async fn success_line_without_trailing_newline_returns_ok() {
    // This is the fix: pre-fix code would return Err because the line
    // sat in the buffer un-flushed when the stream closed.
    consume_stream(s(vec![b"{\"status\":\"success\"}"]))
        .await
        .unwrap();
}

#[tokio::test]
async fn multiple_chunks_with_unterminated_final_success_returns_ok() {
    consume_stream(s(vec![
        b"{\"status\":\"using existing layer\"}\n",
        b"{\"status\":\"writing manifest\"}\n",
        b"{\"status\":\"success\"}",
    ]))
    .await
    .unwrap();
}

#[tokio::test]
async fn stream_without_success_returns_err_with_last_status() {
    let r = consume_stream(s(vec![b"{\"status\":\"writing manifest\"}\n"])).await;
    match r {
        Err(AppError::Inference(msg)) => assert!(msg.contains("writing manifest"), "{msg}"),
        other => panic!("expected Inference err, got {other:?}"),
    }
}

#[tokio::test]
async fn error_chunk_propagates() {
    let r = consume_stream(s(vec![b"{\"error\":\"unsupported quant\"}\n"])).await;
    match r {
        Err(AppError::Inference(msg)) => assert!(msg.contains("unsupported quant"), "{msg}"),
        other => panic!("expected Inference err, got {other:?}"),
    }
}
