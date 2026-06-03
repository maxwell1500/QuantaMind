import { panelBox, panelLabel, codeBlock } from "./pipelineStyles";

/// Phase 2 — System Pkg: the exact system message assembled for the model (tool
/// definitions injected) plus the user line. The real string sent, not a mock.
export function SystemMessagePhase({ systemMessage, userPrompt }: { systemMessage: string; userPrompt: string }) {
  return (
    <div style={panelBox} data-testid="pipeline-system">
      <div style={panelLabel}>Constructed System Message</div>
      <pre style={codeBlock}>
        {`System:\n${systemMessage}\n\nUser: ${userPrompt}`}
      </pre>
    </div>
  );
}
