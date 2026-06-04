/// Format a sandbox tool result as the line injected into the transcript. Single
/// source so the streamed `TrajectoryStep.injection` matches the context exactly.
pub fn tool_result_line(data: &str) -> String {
    format!("Tool result: {data}")
}

/// The running agentic transcript: the initial task prompt plus alternating model
/// turns and injected tool results. `render()` is the `prompt` sent each turn (the
/// system message — the tool schemas — is built separately, once, by the runner).
pub struct Conversation {
    initial_prompt: String,
    turns: Vec<String>,
}

impl Conversation {
    pub fn new(initial_prompt: String) -> Self {
        Self { initial_prompt, turns: Vec::new() }
    }

    pub fn push_model(&mut self, text: &str) {
        self.turns.push(format!("Assistant: {}", text.trim()));
    }

    pub fn push_tool_result(&mut self, data: &str) {
        self.turns.push(tool_result_line(data));
    }

    pub fn render(&self) -> String {
        if self.turns.is_empty() {
            return self.initial_prompt.clone();
        }
        format!("{}\n\n{}", self.initial_prompt, self.turns.join("\n"))
    }

    /// Wipe to a fresh task for the next Pass^k iteration — absolute isolation, no
    /// state bleed between runs.
    pub fn reset(&mut self, initial_prompt: String) {
        self.initial_prompt = initial_prompt;
        self.turns.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_is_just_the_prompt_before_any_turn() {
        let c = Conversation::new("Do the task.".into());
        assert_eq!(c.render(), "Do the task.");
    }

    #[test]
    fn render_appends_model_turns_and_tool_results_in_order() {
        let mut c = Conversation::new("Do the task.".into());
        c.push_model("  {\"name\":\"f\",\"args\":{}}  ");
        c.push_tool_result("{\"ok\":true}");
        assert_eq!(
            c.render(),
            "Do the task.\n\nAssistant: {\"name\":\"f\",\"args\":{}}\nTool result: {\"ok\":true}"
        );
    }

    #[test]
    fn reset_wipes_all_turns_and_swaps_the_prompt() {
        let mut c = Conversation::new("A".into());
        c.push_model("x");
        c.reset("B".into());
        assert_eq!(c.render(), "B");
    }
}
