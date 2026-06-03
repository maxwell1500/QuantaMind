use crate::inference::eval::toolcall::tasks::{ToolSchema, ToolTask};
use serde_json::json;

/// Build the system prompt for a tool-call task: the available tools as a JSON
/// block + an explicit instruction to emit ONLY a JSON call (or array) when a
/// tool is needed, else answer normally. The explicitness is deliberate — a
/// weak model's format failures then surface as a low `parse_rate` (the signal).
pub fn build_system(task: &ToolTask) -> String {
    build_system_for(&task.tools)
}

/// The tool-schema-injection core, given just the tools. Shared so the agentic
/// runner (which has a sandbox, not a `ToolTask`) builds the identical prompt.
pub fn build_system_for(tools: &[ToolSchema]) -> String {
    let tools: Vec<_> = tools
        .iter()
        .map(|t| json!({ "name": t.name, "description": t.description, "parameters": t.parameters }))
        .collect();
    let tools_json = serde_json::to_string_pretty(&tools).unwrap_or_default();
    format!(
        "You can call tools. Available tools:\n{tools_json}\n\n\
         When a tool is needed, respond with ONLY a JSON object of the form \
         {{\"name\": \"<tool>\", \"args\": {{...}}}}. To call several tools, respond \
         with a JSON array of such objects. Do not add prose, explanation, or \
         markdown around the JSON. If no tool is needed, just answer the user in \
         plain text."
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::eval::toolcall::tasks::tasks;

    fn task(id: &str) -> ToolTask {
        tasks().into_iter().find(|t| t.id == id).expect("task exists")
    }

    #[test]
    fn prompt_lists_all_tool_names() {
        let p = build_system(&task("select-email")); // a multi-tool task
        for name in ["get_weather", "send_email", "search_web"] {
            assert!(p.contains(name), "missing tool {name}");
        }
    }

    #[test]
    fn prompt_includes_param_names_and_types() {
        let p = build_system(&task("select-email"));
        assert!(p.contains("\"to\""));
        assert!(p.contains("\"subject\""));
        assert!(p.contains("string"));
    }

    #[test]
    fn instruction_requests_json_only_and_mentions_arrays() {
        let p = build_system(&task("weather-paris"));
        assert!(p.contains("ONLY a JSON object"));
        assert!(p.contains("JSON array"));
        assert!(p.contains("plain text"));
    }
}
