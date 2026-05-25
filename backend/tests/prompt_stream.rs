use mockito::Server;
use quantamind_lib::commands::prompt::run_prompt_inner;
use quantamind_lib::errors::AppError;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn tokens_arrive_in_order_and_concat_to_fixture() {
    let mut server = Server::new_async().await;
    let body = "{\"model\":\"x\",\"response\":\"The \",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"sky \",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"is \",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"blue.\",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"\",\"done\":true}\n";
    let _mock = server
        .mock("POST", "/api/generate")
        .with_status(200)
        .with_body(body)
        .create_async()
        .await;

    let mut tokens: Vec<String> = Vec::new();
    run_prompt_inner(
        &server.url(),
        "x",
        "Why is the sky blue?",
        None,
        None,
        None,
        CancellationToken::new(),
        |t| tokens.push(t.to_string()),
    )
    .await
    .unwrap();

    assert_eq!(tokens, vec!["The ", "sky ", "is ", "blue."]);
    assert_eq!(tokens.concat(), "The sky is blue.");
}

#[tokio::test]
async fn empty_prompt_rejected_before_http() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/api/generate")
        .expect(0)
        .create_async()
        .await;

    match run_prompt_inner(
        &server.url(),
        "x",
        "   ",
        None,
        None,
        None,
        CancellationToken::new(),
        |_| {},
    )
    .await
    {
        Err(AppError::Validation(msg)) => assert!(msg.contains("prompt"), "msg: {msg}"),
        other => panic!("expected Validation err, got {other:?}"),
    }
    mock.assert_async().await;
}

#[tokio::test]
async fn empty_model_rejected_before_http() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/api/generate")
        .expect(0)
        .create_async()
        .await;

    match run_prompt_inner(&server.url(), "", "hi", None, None, None, CancellationToken::new(), |_| {}).await {
        Err(AppError::Validation(msg)) => assert!(msg.contains("model"), "msg: {msg}"),
        other => panic!("expected Validation err, got {other:?}"),
    }
    mock.assert_async().await;
}
