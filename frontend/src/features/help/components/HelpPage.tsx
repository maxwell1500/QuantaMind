import { useEffect, useState } from "react";
import { HELP_SECTIONS } from "./helpSections";
import { HelpSidebar } from "./HelpSidebar";
import { HelpContent } from "./HelpContent";
import { UpdateChecker } from "./UpdateChecker";

/// Read a `#help-<section>[-<block>]` hash and return the section id if it names a
/// real section, else null. Lets other pages deep-link into the help (e.g. the
/// CSV importer's "learn more").
function sectionFromHash(): string | null {
  const m = /^#help-([a-z0-9]+)/i.exec(location.hash);
  const id = m?.[1];
  return id && HELP_SECTIONS.some((s) => s.id === id) ? id : null;
}

export function HelpPage() {
  const [activeId, setActiveId] = useState<string>(() => sectionFromHash() ?? HELP_SECTIONS[0].id);

  // Honor deep links that arrive while the page is already mounted (a hash set by
  // another tab's "learn more"), and scroll to the specific block if one is named.
  useEffect(() => {
    const apply = () => {
      const id = sectionFromHash();
      if (id) {
        setActiveId(id);
        // Let the section render before scrolling to the block anchor.
        setTimeout(() => {
          const el = document.querySelector(location.hash);
          el?.scrollIntoView({ block: "start" });
        }, 0);
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const section = HELP_SECTIONS.find((s) => s.id === activeId) ?? HELP_SECTIONS[0];

  return (
    <section data-testid="page-help" className="flex flex-col gap-3 h-full">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Help</h2>
        <p className="text-xs text-gray-600">
          What every page, tool, and graph does — why it’s there, and how it’s computed.
          If something here is wrong or missing, use the Feedback button bottom-right.
        </p>
      </header>
      <UpdateChecker />
      <div className="flex flex-1 min-h-0 gap-2">
        <HelpSidebar activeId={section.id} onSelect={setActiveId} />
        <HelpContent section={section} />
      </div>
    </section>
  );
}
