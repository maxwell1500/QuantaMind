import { useEffect, useRef, useState } from "react";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useReadinessStore } from "../state/readinessStore";
import { HostHardwareProfile } from "./HostHardwareProfile";
import { ProfileSelector } from "./ProfileSelector";
import { VerdictTable } from "./VerdictTable";
import { RecommendationBanner } from "./RecommendationBanner";
import { ExportMenu } from "./ExportMenu";
import { useNavStore } from "../../../shared/state/navStore";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { READINESS_HELP } from "../readinessHelp";

/// The Agent Readiness page: pick a target collection + a profile, run the
/// verdict over that collection's last persisted batch report, and read a
/// transparent Ready / Conditional / NotReady per model with its reasons.
export function AgentReportPage() {
  const { presets, collections, selected, select, init } = useEvalRegistryStore();
  const {
    profiles,
    selectedProfileId,
    verdicts,
    hardware,
    capBytes,
    assessed,
    loading,
    error,
    loadProfiles,
    loadHardware,
    selectProfile,
    setCap,
    assess,
    saveProfile,
  } = useReadinessStore();
  const goBack = useNavStore((s) => s.goBack);
  const [showNativeFc, setShowNativeFc] = useState(true);
  // The report card (banner + table) snapshotted to PNG by the export menu.
  const cardRef = useRef<HTMLDivElement>(null);

  // Changing the cap re-assesses fit in-session (only once a run is on screen).
  const onCapChange = (bytes: number) => {
    setCap(bytes);
    if (assessed) void assess(selected);
  };

  useEffect(() => {
    if (presets.length === 0) void init().catch(() => {});
    void loadProfiles();
    void loadHardware();
  }, [presets.length, init, loadProfiles, loadHardware]);

  const options = [...presets.map((p) => ({ id: p.id, label: p.label })), ...collections.map((c) => ({ id: c, label: c }))];
  const activeProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <div
      data-testid="agent-report-page"
      className="bg-white border border-slate-250 shadow-md rounded-xl overflow-hidden max-w-6xl mx-auto flex flex-col"
    >
      {/* Title Header */}
      <header className="bg-slate-900 px-6 py-4 border-b border-slate-900 flex items-center gap-2">
        <h1 className="text-sm font-bold tracking-wider text-white uppercase">
          LOCAL AGENT READINESS VALIDATOR
        </h1>
        <InfoButton {...READINESS_HELP.page} align="left" testId="readiness-page" />
      </header>

      {error && (
        <div data-testid="readiness-error" className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Section 1: Host Hardware Profile & Active Thresholds */}
      <section className="px-6 py-5 border-b border-slate-250 bg-slate-50/20 space-y-4 flex flex-col">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2 select-none">
          <span>▼</span> HOST HARDWARE PROFILE & ACTIVE THRESHOLDS
        </div>

        <HostHardwareProfile hardware={hardware} capBytes={capBytes} onCapChange={onCapChange} />

        <ProfileSelector
          profiles={profiles}
          selectedId={selectedProfileId}
          onSelect={selectProfile}
          onSaveProfile={async (p) => {
            await saveProfile(p);
            if (assessed) await assess(selected);
          }}
        />

        {/* Collection & Execution Actions */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4 pt-4 border-t border-slate-200/50">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Evaluation Collection
            </span>
            <div className="relative w-48">
              <select
                data-testid="readiness-collection-select"
                value={selected}
                onChange={(e) => void select(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-slate-350 focus:border-slate-450 focus:ring-1 focus:ring-slate-450 rounded-lg py-1.5 pl-3 pr-10 text-sm text-slate-800 shadow-sm transition-all outline-none appearance-none cursor-pointer"
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="readiness-run"
            className="flex items-center justify-center gap-2 py-1.5 px-4 bg-slate-950 hover:bg-slate-900 active:bg-slate-950 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 shadow-sm hover:shadow active:scale-[0.98] duration-150 cursor-pointer disabled:cursor-not-allowed h-[34px]"
            disabled={loading || !selectedProfileId}
            onClick={() => void assess(selected)}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Assessing…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Run Validation</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Section 2: Verdict & Diagnostics */}
      <section className="px-6 py-5 space-y-4 bg-white flex flex-col">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3 select-none">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <span>▼</span> VERDICT & DIAGNOSTICS
          </span>
          {verdicts.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-550">
              <span className="flex items-center gap-1 text-slate-700">
                Show Native-FC Path
                <InfoButton {...READINESS_HELP.nativeFc} testId="readiness-nativefc" />
              </span>
              <button
                type="button"
                className={`px-3 py-1 border rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  showNativeFc
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-slate-50 border-slate-250 text-slate-400 opacity-60 hover:opacity-100"
                }`}
                onClick={() => setShowNativeFc(!showNativeFc)}
              >
                {showNativeFc ? "ON 🟢" : "OFF 🔴"}
              </button>
            </div>
          )}
        </div>

        {verdicts.length > 0 && (
          <div className="space-y-6" ref={cardRef}>
            <RecommendationBanner
              verdicts={verdicts}
              profileName={activeProfile?.name ?? "this profile"}
            />
            <VerdictTable
              verdicts={verdicts}
              profileName={activeProfile?.name}
              showNativeFc={showNativeFc}
            />
          </div>
        )}

        {assessed && verdicts.length === 0 && !error && (
          <div
            data-testid="readiness-empty"
            className="flex flex-col items-center justify-center p-12 text-center bg-white border border-dashed border-slate-200 rounded-xl min-h-[300px] shadow-sm/5 gap-3"
          >
            <div className="p-3 bg-amber-50 rounded-full border border-amber-100 text-amber-500">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">No batch report found</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              No batch report found for “{selected}”. Run a batch for this collection on the Eval tab, then come back to assess it.
            </p>
          </div>
        )}

        {!assessed && !loading && (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-dashed border-slate-200 rounded-xl min-h-[300px] shadow-sm/5 gap-3">
            <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Awaiting Assessment</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Pick a target collection and a profile, then Run readiness.
            </p>
          </div>
        )}
      </section>

      {/* Footer Controls */}
      <footer className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between mt-auto">
        <button
          type="button"
          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-all cursor-pointer shadow-sm"
          onClick={goBack}
        >
          Cancel / Back
        </button>

        {verdicts.length > 0 && activeProfile && (
          <ExportMenu
            verdicts={verdicts}
            profile={activeProfile}
            collectionId={selected}
            hardware={hardware}
            cardRef={cardRef}
          />
        )}
      </footer>
    </div>
  );
}
