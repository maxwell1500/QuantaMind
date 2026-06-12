import { HELP_SECTIONS } from "./helpSections";

/// Left rail of the Help page: one entry per documented section. Clicking swaps
/// the center pane (state lives in HelpPage). The active entry is highlighted.
export function HelpSidebar({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Help sections"
      data-testid="help-sidebar"
      className="w-52 shrink-0 border-r border-slate-200 pr-3 overflow-auto"
    >
      <ul className="flex flex-col gap-0.5">
        {HELP_SECTIONS.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                data-testid={`help-nav-${s.id}`}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "w-full text-left px-3 py-1.5 text-sm font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200"
                    : "w-full text-left px-3 py-1.5 text-sm font-medium text-slate-600 rounded-md hover:bg-slate-100 hover:text-slate-900 transition-colors"
                }
              >
                {s.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
