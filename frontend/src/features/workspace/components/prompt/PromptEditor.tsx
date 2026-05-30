import Editor from "@monaco-editor/react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  testId?: string;
  height?: string;
};

export function PromptEditor({
  value,
  onChange,
  label,
  testId = "prompt-editor",
  height = "240px",
}: Props) {
  return (
    <div className="space-y-1">
      {label && <div className="text-xs text-gray-600">{label}</div>}
      <div className="border rounded overflow-hidden" data-testid={testId}>
        <Editor
          height={height}
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
    </div>
  );
}
