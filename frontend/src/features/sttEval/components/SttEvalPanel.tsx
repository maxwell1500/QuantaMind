import { useCallback, useEffect, useState } from "react";
import {
  listSttEvals,
  loadSttEval,
  runSttEval,
  listSttReadinessProfiles,
  assessSttReadiness,
  type SttReport,
  type SttModelVerdict,
  type SttReadinessProfile,
  type SttEvalSpec,
} from "../../../shared/ipc/stt/eval";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { EvalReportTable } from "./EvalReportTable";
import { EvalVerdictTable } from "./EvalVerdictTable";
import { SttEvalEditor } from "./SttEvalEditor";

/// The STT eval surface: create/edit a spec → score the stored transcripts (dumb
/// runner, decoupled from transcription) → pick a readiness profile → assess.
export function SttEvalPanel() {
  const [specs, setSpecs] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<SttReadinessProfile[]>([]);
  const [spec, setSpec] = useState("");
  const [profileId, setProfileId] = useState("");
  const [report, setReport] = useState<SttReport | null>(null);
  const [verdicts, setVerdicts] = useState<SttModelVerdict[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not editing; otherwise the spec being edited (empty for a new one).
  const [editing, setEditing] = useState<{ name: string; spec?: SttEvalSpec } | null>(null);

  const refreshSpecs = useCallback(async () => {
    const s = await listSttEvals();
    setSpecs(s);
    setSpec((cur) => cur || s[0] || "");
    return s;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [, p] = await Promise.all([refreshSpecs(), listSttReadinessProfiles()]);
        setProfiles(p);
        setProfileId((cur) => cur || p[0]?.id || "");
      } catch (e) {
        setError(formatIpcError(e));
      }
    })();
  }, [refreshSpecs]);

  const run = async () => {
    if (!spec) return;
    setBusy(true);
    setError(null);
    setVerdicts([]);
    try {
      setReport(await runSttEval(spec));
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setBusy(false);
    }
  };

  const assess = async () => {
    if (!spec || !profileId) return;
    setBusy(true);
    setError(null);
    try {
      setVerdicts(await assessSttReadiness(spec, profileId));
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setBusy(false);
    }
  };

  const edit = async () => {
    if (!spec) return;
    try {
      setEditing({ name: spec, spec: await loadSttEval(spec) });
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const onSaved = async (name: string) => {
    setEditing(null);
    setReport(null);
    setVerdicts([]);
    try {
      await refreshSpecs();
      setSpec(name);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  return (
    <div className="flex flex-col gap-3 border rounded p-3" data-testid="stt-eval-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">STT Eval &amp; Readiness</div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing({ name: "" })}
            data-testid="stt-eval-new"
            className="text-xs border rounded px-2 py-1"
          >
            + New spec
          </button>
        )}
      </div>

      {editing ? (
        <SttEvalEditor
          initialName={editing.name}
          initialSpec={editing.spec}
          onSaved={(n) => void onSaved(n)}
          onCancel={() => setEditing(null)}
        />
      ) : specs.length === 0 ? (
        <p className="text-xs text-gray-500" data-testid="stt-eval-no-specs">
          No eval specs yet. Click <strong>+ New spec</strong> — or Generate starter — to score accuracy
          against your stored transcripts.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <select data-testid="stt-eval-spec" value={spec} onChange={(e) => setSpec(e.target.value)} className="text-sm border rounded px-2 py-1">
              {specs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="button" onClick={() => void edit()} disabled={!spec} data-testid="stt-eval-edit" className="text-xs border rounded px-2 py-1 disabled:opacity-50">
              Edit
            </button>
            <button type="button" onClick={() => void run()} disabled={busy || !spec} data-testid="stt-eval-run" className="text-sm border rounded px-3 py-1 disabled:opacity-50">
              Run eval
            </button>
            <span className="w-px h-5 bg-gray-200" aria-hidden />
            <select data-testid="stt-eval-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="text-sm border rounded px-2 py-1">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => void assess()} disabled={busy || !report || !profileId} data-testid="stt-eval-assess" className="text-sm border rounded px-3 py-1 disabled:opacity-50">
              Assess readiness
            </button>
          </div>
          {error && <div role="alert" className="text-xs text-red-600" data-testid="stt-eval-error">{error}</div>}
          {report && <EvalReportTable rows={report.rows} />}
          {verdicts.length > 0 && <EvalVerdictTable verdicts={verdicts} />}
        </>
      )}
    </div>
  );
}
