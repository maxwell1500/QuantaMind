import { useEffect, useMemo, useState } from "react";
import {
  listTranscripts,
  saveSttEval,
  type TranscriptSummary,
  type SttEvalSpec,
} from "../../../shared/ipc/stt/eval";
import { formatIpcError } from "../../../shared/ipc/core/error";

interface Row {
  id: string;
  reference: string;
  critical: string;
}

const toSpec = (rows: Row[]): SttEvalSpec => ({
  tasks: rows.map((r) => ({
    id: r.id,
    reference: r.reference.trim() || null,
    critical_tokens: r.critical.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
  })),
});

/// Simple spec editor: pick a stored transcript per task (no hunting for clip ids),
/// prefill its text as the reference, add critical tokens. "Generate starter" makes
/// one self-referenced task per transcript so the panel works immediately.
export function SttEvalEditor({
  initialName = "",
  initialSpec,
  onSaved,
  onCancel,
}: {
  initialName?: string;
  initialSpec?: SttEvalSpec;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([]);
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(
    initialSpec?.tasks.map((t) => ({
      id: t.id,
      reference: t.reference ?? "",
      critical: t.critical_tokens.join(", "),
    })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setTranscripts(await listTranscripts());
      } catch (e) {
        setError(formatIpcError(e));
      }
    })();
  }, []);

  const textOf = useMemo(() => {
    const m = new Map(transcripts.map((t) => [t.id, t.text]));
    return (id: string) => m.get(id) ?? "";
  }, [transcripts]);

  const addRow = () => {
    const id = transcripts[0]?.id ?? "";
    setRows((rs) => [...rs, { id, reference: textOf(id), critical: "" }]);
  };
  const generateStarter = () => {
    setRows(transcripts.map((t) => ({ id: t.id, reference: t.text, critical: "" })));
    setName((n) => n || "starter");
  };
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Picking a transcript prefills its text only when the reference is still empty.
  const pickTranscript = (i: number, id: string) =>
    setRow(i, { id, reference: rows[i].reference.trim() ? rows[i].reference : textOf(id) });

  const save = async () => {
    if (!name.trim()) return setError("Give the spec a name.");
    if (rows.length === 0) return setError("Add at least one task.");
    setBusy(true);
    setError(null);
    try {
      await saveSttEval(name.trim(), toSpec(rows));
      onSaved(name.trim());
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border rounded p-2 bg-gray-50" data-testid="stt-eval-editor">
      <div className="flex items-center gap-2">
        <input
          data-testid="stt-eval-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="spec name"
          className="text-sm border rounded px-2 py-1 flex-1"
        />
        <button
          type="button"
          onClick={generateStarter}
          disabled={transcripts.length === 0}
          data-testid="stt-eval-starter"
          title="One task per stored transcript, each referenced to its own text"
          className="text-xs border rounded px-2 py-1 disabled:opacity-50"
        >
          Generate starter ({transcripts.length})
        </button>
      </div>

      {transcripts.length === 0 && (
        <p className="text-xs text-gray-500" data-testid="stt-eval-no-transcripts">
          No transcripts yet — record or upload audio in the Workspace first.
        </p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-1 border rounded p-2 bg-white" data-testid={`stt-eval-task-${i}`}>
          <div className="flex items-center gap-2">
            <select
              data-testid={`stt-eval-task-id-${i}`}
              value={r.id}
              onChange={(e) => pickTranscript(i, e.target.value)}
              className="text-xs border rounded px-1 py-0.5 flex-1 font-mono"
            >
              {transcripts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              data-testid={`stt-eval-remove-${i}`}
              className="text-xs text-red-600 px-1"
              aria-label="remove task"
            >
              ✕
            </button>
          </div>
          <textarea
            data-testid={`stt-eval-ref-${i}`}
            value={r.reference}
            onChange={(e) => setRow(i, { reference: e.target.value })}
            placeholder="reference text (blank = behavioral-only, 'accuracy unverified')"
            rows={2}
            className="text-xs border rounded px-1 py-0.5"
          />
          <input
            data-testid={`stt-eval-crit-${i}`}
            value={r.critical}
            onChange={(e) => setRow(i, { critical: e.target.value })}
            placeholder="critical tokens, comma-separated (e.g. $100, ruben)"
            className="text-xs border rounded px-1 py-0.5"
          />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={transcripts.length === 0}
          data-testid="stt-eval-add"
          className="text-xs border rounded px-2 py-1 disabled:opacity-50"
        >
          + Task
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onCancel} data-testid="stt-eval-cancel" className="text-xs px-2 py-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          data-testid="stt-eval-save"
          className="text-xs border rounded px-3 py-1 bg-blue-50 disabled:opacity-50"
        >
          Save spec
        </button>
      </div>
      {error && <div role="alert" className="text-xs text-red-600" data-testid="stt-eval-editor-error">{error}</div>}
    </div>
  );
}
