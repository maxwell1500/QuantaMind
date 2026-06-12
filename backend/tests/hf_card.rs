use mockito::Server;
use quantamind_lib::inference::hf::hf_card::fetch_model_card;

#[tokio::test]
async fn fetches_card_as_structured_data() {
    let mut server = Server::new_async().await;
    let _m = server.mock("GET", "/meta/llama/raw/main/README.md")
        .with_status(200)
        .with_body("---\nlicense: llama3\npipeline_tag: text-generation\n---\n# Llama\n\nA fast model.")
        .create_async().await;

    let card = fetch_model_card(&server.url(), "meta/llama").await.unwrap().expect("a card");
    assert_eq!(card.license.as_deref(), Some("llama3"));
    assert_eq!(card.pipeline_tag.as_deref(), Some("text-generation"));
    assert!(card.description.contains("A fast model"));
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
