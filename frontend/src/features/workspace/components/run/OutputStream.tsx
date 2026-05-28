type Props = { output: string; loading?: boolean };

export function OutputStream({ output, loading = false }: Props) {
  if (loading && !output) {
    return (
      <div
        data-testid="output-stream-loading"
        className="border rounded p-3 min-h-[120px] text-sm bg-gray-50 flex items-center gap-2 text-gray-600"
      >
        <span
          aria-hidden
          className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"
        />
        <span>Loading model… large models can take 30+ seconds on first load.</span>
      </div>
    );
  }
  return (
    <pre
      data-testid="output-stream"
      className="border rounded p-3 min-h-[120px] text-sm whitespace-pre-wrap bg-gray-50"
    >
      {output}
    </pre>
  );
}
