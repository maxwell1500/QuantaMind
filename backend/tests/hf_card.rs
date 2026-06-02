use mockito::Server;
use quantamind_lib::inference::hf::hf_card::fetch_model_card;

#[tokio::test]
async fn fetches_card_and_strips_frontmatter() {
    let mut server = Server::new_async().await;
    let _m = server.mock("GET", "/meta/llama/raw/main/README.md")
        .with_status(200)
        .with_body("---\nlicense: llama3\n---\n# Llama\n\nA model.")
        .create_async().await;

    let card = fetch_model_card(&server.url(), "meta/llama").await.unwrap();
    assert_eq!(card.as_deref(), Some("# Llama\n\nA model."));
}

#[tokio::test]
async fn missing_readme_is_none_not_an_error() {
    let mut server = Server::new_async().await;
    let _m = server.mock("GET", "/x/y/raw/main/README.md")
        .with_status(404).create_async().await;
    assert_eq!(fetch_model_card(&server.url(), "x/y").await.unwrap(), None);
}

#[tokio::test]
async fn invalid_repo_is_rejected() {
    assert!(fetch_model_card("http://x", "not-a-repo").await.is_err());
}
