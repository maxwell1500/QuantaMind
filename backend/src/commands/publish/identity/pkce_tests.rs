use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[test]
fn challenge_is_stable_and_url_safe_no_pad() {
    let c = pkce_challenge("verifier-123");
    assert_eq!(c, pkce_challenge("verifier-123")); // deterministic
    assert!(!c.contains('=') && !c.contains('+') && !c.contains('/')); // url-safe, no pad
    assert_ne!(c, pkce_challenge("verifier-124"));
}

#[test]
fn pkce_pair_verifier_is_in_range_and_challenge_matches() {
    let (v, c) = pkce_pair();
    assert!((43..=128).contains(&v.len()));
    assert_eq!(c, pkce_challenge(&v));
}

#[test]
fn parses_code_from_request_line() {
    let raw = "GET /callback?code=abc123&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
    assert_eq!(parse_code_from_request(raw).as_deref(), Some("abc123"));
    assert_eq!(parse_code_from_request("GET /callback?state=only HTTP/1.1"), None);
}

#[tokio::test]
async fn await_redirect_returns_the_code_and_replies() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(await_redirect(listener));

    let mut client = TcpStream::connect(addr).await.unwrap();
    client.write_all(b"GET /callback?code=loopback_ok&state=s HTTP/1.1\r\n\r\n").await.unwrap();
    let mut resp = Vec::new();
    client.read_to_end(&mut resp).await.unwrap();

    assert_eq!(server.await.unwrap().unwrap(), "loopback_ok");
    assert!(String::from_utf8_lossy(&resp).contains("close this tab"));
}
