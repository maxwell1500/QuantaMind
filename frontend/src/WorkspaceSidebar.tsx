import { useUiStore } from "./shared/state/uiStore";
import { WorkspaceSwitcher } from "./features/workspaces/components/WorkspaceSwitcher";
import { BackendList } from "./features/workspace/components/backend/BackendList";
import { FilesSection } from "./features/workspaces/components/FilesSection";

/// The Workspace's single left rail, composed at the shell level (features
/// don't import each other): folder picker on top, then backends, then files.
export function WorkspaceSidebar() {
  const visible = useUiStore((s) => s.sidebarVisible);
  const toggle = useUiStore((s) => s.toggleSidebar);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Show sidebar"
        data-testid="sidebar-open"
        className="text-gray-500 hover:text-ink px-1 py-1 text-lg self-start"
      >
        ›
      </button>
    );
  }
  return (
    <aside
      data-testid="workspace-sidebar"
      className="w-64 shrink-0 border-r pr-3 pl-1 py-2 overflow-y-auto space-y-3"
    >
      <div className="flex justify-end px-1">
        <button
          type="button"
          onClick={toggle}
          aria-label="Hide sidebar"
          data-testid="sidebar-close"
          className="text-gray-500 hover:text-ink text-lg leading-none"
        >
          ‹
        </button>
      </div>
      <WorkspaceSwitcher />
      <BackendList />
      <FilesSection />
    </aside>
  );
}
