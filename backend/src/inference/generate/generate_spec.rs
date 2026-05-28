use crate::inference::generate::generate_options::GenerateOptions;

/// The inputs to one generation, grouped so every backend shares a
/// single shape. Fields are owned so a spec can move into a spawned task.
#[derive(Clone, Debug, Default)]
pub struct GenerateSpec {
    pub model: String,
    pub prompt: String,
    pub system: Option<String>,
    pub options: Option<GenerateOptions>,
    pub keep_alive: Option<i32>,
}
