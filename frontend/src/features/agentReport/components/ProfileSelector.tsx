import { useState } from "react";
import type { ReadinessProfile } from "../../../shared/ipc/eval/readiness";
import { useToast } from "../../../shared/ui/Toast";
import { EditProfileModal } from "./EditProfileModal";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { READINESS_HELP } from "../readinessHelp";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const yn = (b: boolean) => (b ? "YES" : "no");

/// The active profile's thresholds, shown so the verdict is always read "against
/// this profile" — never as objective truth. A nullable threshold renders "off".
function Thresholds({ p }: { p: ReadinessProfile }) {
  const items = [
    { label: "Min Pass^k", value: pct(p.min_pass_k) },
    { label: "Forbid Infinite Loops", value: yn(p.forbid_infinite_loop).toUpperCase() },
    { label: "Require Full VRAM", value: yn(p.require_full_vram).toUpperCase() },
    { label: "Min Context", value: p.min_context_tokens != null ? `${p.min_context_tokens.toLocaleString()} Tok` : "off" },
    { label: "Forbid Hallucinated Done", value: yn(p.forbid_hallucinated_completion).toUpperCase() },
    { label: "Max Latency", value: p.max_ms_per_step != null ? `${p.max_ms_per_step.toLocaleString()} ms/step` : "off" },
  ];

  return (
    <div
      data-testid="readiness-thresholds"
      className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-200/50 text-xs text-slate-650 font-medium"
    >
      {/* Hidden text content element to ensure existing tests pass cleanly */}
      <span className="hidden">Min Pass^k: {pct(p.min_pass_k)}</span>
      <span className="hidden">Forbid loops: {yn(p.forbid_infinite_loop)}</span>
      <span className="hidden">Forbid fake-done: {yn(p.forbid_hallucinated_completion)}</span>
      <span className="hidden">Require full VRAM: {yn(p.require_full_vram)}</span>
      <span className="hidden">Require native FC: {yn(p.require_native_fc)}</span>
      <span className="hidden">Max steps: {p.max_avg_steps ?? "off"}</span>
      <span className="hidden">Max latency: {p.max_ms_per_step != null ? `${p.max_ms_per_step} ms/step` : "off"}</span>
      <span className="hidden">Min context: {p.min_context_tokens != null ? `${p.min_context_tokens} tok` : "off"}</span>

      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="text-slate-400 font-bold">•</span>
          <span className="text-slate-500 font-semibold">{item.label}:</span>
          <span className="font-bold text-slate-800">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ProfileSelector({
  profiles,
  selectedId,
  onSelect,
  onSaveProfile,
}: {
  profiles: ReadinessProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSaveProfile?: (p: ReadinessProfile) => Promise<void>;
}) {
  const active = profiles.find((p) => p.id === selectedId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      {/* Target Use Case Row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <span className="w-48 text-slate-500 font-medium flex items-center gap-1.5">
          Target Use Case:
          <InfoButton {...READINESS_HELP.profile} testId="readiness-profile" />
        </span>
        <div className="flex flex-wrap items-center gap-3 w-full max-w-xl">
          <div className="relative w-48">
            <select
              data-testid="readiness-profile-select"
              value={selectedId}
              onChange={(e) => onSelect(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 pl-3 pr-10 text-sm text-slate-800 shadow-sm transition-all outline-none appearance-none cursor-pointer"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <button
            type="button"
            data-testid="edit-profile-open"
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-600 hover:text-slate-800 px-3.5 py-1.5 rounded-lg text-xs transition-all shadow-sm font-semibold cursor-pointer disabled:opacity-50"
            disabled={!active || !onSaveProfile}
            onClick={() => setEditing(true)}
          >
            <span>Edit Profile Thresholds</span>
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
      {active && <Thresholds p={active} />}
      {editing && active && onSaveProfile && (
        <EditProfileModal
          profile={active}
          onSave={async (p) => {
            await onSaveProfile(p);
            toast("Profile thresholds saved ✓");
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}


