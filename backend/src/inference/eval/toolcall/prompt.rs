use crate::inference::eval::toolcall::tasks::{ToolSchema, ToolTask};
use serde_json::json;

/// How the final answer must be delivered — the closing line of the tool system
/// prompt. Agentic ACT-tasks (`RequireAll`/`RequireSequence`) require every result,
/// including the final report, to go THROUGH a tool; without this a model that reports
/// the correct answer in plain text (as `PlainTextOk` invites) fails as a hallucination
/// even though it did the task. Abstain-tasks (`ExpectAbstainingText`) and single-turn
/// tool-selection keep the plain-text option — there, prose is the correct output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TerminalGuidance {
    /// "If no tool is needed, just answer the user in plain text."
    PlainTextOk,
    /// "Deliver every result — including your final answer — by calling a tool."
    MustUseTools,
}

/// Build the system prompt for a single-turn tool-call task. Single-turn selection
/// allows a plain-text answer when no tool applies, so it keeps `PlainTextOk`.
pub fn build_system(task: &ToolTask) -> String {
    build_system_for(&task.tools, TerminalGuidance::PlainTextOk)
}

/// The tool-schema-injection core, given the tools + how the final answer must be
/// delivered. Shared so the agentic runner (which has a sandbox, not a `ToolTask`)
/// builds the identical prompt, gating the closing line on its task's end_state.
pub fn build_system_for(tools: &[ToolSchema], terminal: TerminalGuidance) -> String {
    let tools: Vec<_> = tools
        .iter()
        .map(|t| json!({ "name": t.name, "description": t.description, "parameters": t.parameters }))
        .collect();
    let tools_json = serde_json::to_string_pretty(&tools).unwrap_or_default();
    let closing = match terminal {
        TerminalGuidance::PlainTextOk => "If no tool is needed, just answer the user in plain text.",
        TerminalGuidance::MustUseTools => {
            "Deliver every result — including your final answer to the user — by calling a tool \
             (use the `reply` tool if one is provided). Do not answer in plain text."
        }
    };
    format!(
        "You can call tools. Available tools:\n{tools_json}\n\n\
         When a tool is needed, respond with ONLY a JSON object of the form \
         {{\"name\": \"<tool>\", \"args\": {{...}}}}. To call several tools, respond \
         with a JSON array of such objects. Do not add prose, explanation, or \
         markdown around the JSON. {closing}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::toolcall::tasks::{Call, Expected};
    use serde_json::json;

    fn tool(name: &str, props: serde_json::Value) -> ToolSchema {
        ToolSchema { name: name.into(), description: format!("{name} tool"), parameters: json!({ "type": "object", "properties": props }) }
    }

    /// A multi-tool task (mirrors the old "select-email" fixture shape).
    fn multi_tool_task() -> ToolTask {
        ToolTask {
            id: "select-email".into(),
            category: "select".into(),
            prompt: "Email the team the weather.".into(),
            tools: vec![
                tool("get_weather", json!({ "city": { "type": "string" } })),
                tool("send_email", json!({ "to": { "type": "string" }, "subject": { "type": "string" } })),
                tool("search_web", json!({ "q": { "type": "string" } })),
            ],
            expected: Expected::Call(Call { name: "send_email".into(), args: json!({ "to": "team", "subject": "wx" }) }),
            agentic: None,
        }
    }

    #[test]
    fn prompt_lists_all_tool_names() {
        let p = build_system(&multi_tool_task());
        for name in ["get_weather", "send_email", "search_web"] {
            assert!(p.contains(name), "missing tool {name}");
        }
    }

    #[test]
    fn prompt_includes_param_names_and_types() {
        let p = build_system(&multi_tool_task());
        assert!(p.contains("\"to\""));
        assert!(p.contains("\"subject\""));
        assert!(p.contains("string"));
    }

    #[test]
    fn instruction_requests_json_only_and_mentions_arrays() {
        let p = build_system(&multi_tool_task());
        assert!(p.contains("ONLY a JSON object"));
        assert!(p.contains("JSON array"));
        assert!(p.contains("plain text"));
    }

    #[test]
    fn plain_text_ok_keeps_the_plain_text_escape_hatch() {
        let tools = multi_tool_task().tools;
        let p = build_system_for(&tools, TerminalGuidance::PlainTextOk);
        assert!(p.contains("just answer the user in plain text"));
        assert!(!p.contains("Do not answer in plain text"));
    }

    #[test]
    fn must_use_tools_forbids_plain_text_and_names_the_reply_tool() {
        // The G1 fix: an act-task prompt must NOT invite a plain-text final answer —
        // that contradiction is what failed a correct model that reported in prose.
        let tools = multi_tool_task().tools;
        let p = build_system_for(&tools, TerminalGuidance::MustUseTools);
        assert!(p.contains("by calling a tool"));
        assert!(p.contains("Do not answer in plain text"));
        assert!(p.contains("`reply` tool"));
        assert!(!p.contains("just answer the user in plain text"));
    }
}
