type Props = { output: string };

export function OutputStream({ output }: Props) {
  return (
    <pre
      data-testid="output-stream"
      className="border rounded p-3 min-h-[120px] text-sm whitespace-pre-wrap bg-gray-50"
    >
      {output}
    </pre>
  );
}
