import { HELP_SECTIONS } from "./helpSections";
import { UpdateChecker } from "./UpdateChecker";

export function HelpPage() {
  return (
    <section data-testid="page-help" className="flex flex-col gap-4 h-full">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Help</h2>
        <p className="text-xs text-gray-600">
          A guided tour of every tab + the global controls. If something
          here is wrong or missing, use the Feedback button bottom-right.
        </p>
      </header>
      <UpdateChecker />
      <nav
        aria-label="Help sections"
        data-testid="help-toc"
        className="text-xs flex flex-wrap gap-x-3 gap-y-1 text-blue-700"
      >
        {HELP_SECTIONS.map((s) => (
          <a key={s.id} href={`#help-${s.id}`} className="hover:underline">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-5 overflow-auto pr-1">
        {HELP_SECTIONS.map((s) => (
          <article
            key={s.id}
            id={`help-${s.id}`}
            data-testid={`help-section-${s.id}`}
            className="border rounded p-3 bg-white"
          >
            <h3 className="text-sm font-semibold mb-2">{s.title}</h3>
            <div className="text-xs text-gray-700 space-y-1.5">
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
