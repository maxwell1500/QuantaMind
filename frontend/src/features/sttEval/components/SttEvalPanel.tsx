import { useEffect, useState } from "react";
import {
  listSttEvals,
  runSttEval,
  listSttReadinessProfiles,
  assessSttReadiness,
  type SttReport,
  type SttModelVerdict,
  type SttReadinessProfile,
} from "../../../shared/ipc/stt/eval";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { EvalReportTable } from "./EvalReportTable";
import { EvalVerdictTable } from "./EvalVerdictTable";

/// The STT eval surface: pick a spec → score the stored transcripts (dumb runner,
/// decoupled from transcription) → pick a readiness profile → assess. Per-task WER
/// (weighted + critical-token) + behavioral, then a per-model verdict.
export function SttEvalPanel() {
  const [specs, setSpecs] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<SttReadinessProfile[]>([]);
  const [spec, setSpec] = useState("");
  const [profileId, setProfileId] = useState("");
  const [report, setReport] = useState<SttReport | null>(null);
  const [verdicts, setVerdicts] = useState<SttModelVerdict[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([listSttEvals(), listSttReadinessProfiles()]);
        setSpecs(s);
        setProfiles(p);
        setSpec((cur) => cur || s[0] || "");
        setProfileId((cur) => cur || p[0]?.id || "");
      } catch (e) {
        setError(formatIpcError(e));
      }
    })();
  }, []);

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

  return (
    <div className="flex flex-col gap-3 border rounded p-3" data-testid="stt-eval-panel">
      <div className="text-sm font-medium text-gray-700">STT Eval &amp; Readiness</div>
      {specs.length === 0 ? (
        <p className="text-xs text-gray-500" data-testid="stt-eval-no-specs">
          No eval specs yet. Create one (a reference text per stored transcript id) to score accuracy.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <select data-testid="stt-eval-spec" value={spec} onChange={(e) => setSpec(e.target.value)} className="text-sm border rounded px-2 py-1">
              {specs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
