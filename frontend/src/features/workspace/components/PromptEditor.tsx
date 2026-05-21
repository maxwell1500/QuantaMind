import Editor from "@monaco-editor/react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function PromptEditor({ value, onChange }: Props) {
  return (
    <div className="border rounded overflow-hidden" data-testid="prompt-editor">
      <Editor
        height="240px"
        language="markdown"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          wordWrap: "on",
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}
