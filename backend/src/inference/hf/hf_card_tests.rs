use super::*;

const SAMPLE: &str = "---\nlicense: llama3.1\npipeline_tag: text-generation\nbase_model:\n  - meta-llama/Meta-Llama-3.1-8B\ntags:\n  - transformers\n  - unsloth\n---\n<div align=\"center\">\n  <img src=banner.png>\n</div>\n\nMeta Llama 3.1 is a collection of multilingual large language models.\n\n## Benchmarks\n| a | b |\n|---|---|";

#[test]
fn split_frontmatter_separates_yaml_and_body() {
    let (fm, body) = split_frontmatter("---\nlicense: mit\n---\n# Title\nBody");
    assert_eq!(fm, "license: mit");
    assert_eq!(body, "# Title\nBody");
    assert_eq!(split_frontmatter("# No fm").0, "");
}

#[test]
fn to_card_extracts_frontmatter_fields_and_a_prose_description() {
    let card = to_card(SAMPLE);
    assert_eq!(card.license.as_deref(), Some("llama3.1"));
    assert_eq!(card.pipeline_tag.as_deref(), Some("text-generation"));
    assert_eq!(card.base_model.as_deref(), Some("meta-llama/Meta-Llama-3.1-8B")); // first of list
    assert_eq!(card.tags, vec!["transformers", "unsloth"]);
    // Description skips the HTML <div>/<img> and the heading/table.
    assert!(card.description.contains("Meta Llama 3.1 is a collection"));
    assert!(!card.description.contains("<div"));
    assert!(!card.description.contains("|"));
}

#[test]
fn description_takes_at_most_three_paragraphs() {
    let body = "<div>x</div>\n\nOne.\n\nTwo.\n\nThree.\n\nFour.";
    let card = to_card(&format!("---\n---\n{body}"));
    assert_eq!(card.description, "One.\n\nTwo.\n\nThree.");
}

#[test]
fn missing_frontmatter_yields_empty_metadata_but_a_description() {
    let card = to_card("Just a plain description with no metadata.");
    assert!(card.license.is_none() && card.tags.is_empty());
    assert!(card.description.contains("plain description"));
}
