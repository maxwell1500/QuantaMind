import type { DocBlock, DocSection } from "./docSections";

/// One What/Why/How card for a single documented item. A computed metric also
/// gets a monospace formula and a source-file reference so the derivation is
/// fully visible — never a hand-wave.
function Block({ sectionId, block }: { sectionId: string; block: DocBlock }) {
  return (
    <article
      id={`doc-${sectionId}-${block.id}`}
      data-testid={`doc-block-${sectionId}-${block.id}`}
      className="border border-slate-200 rounded-lg p-4 bg-white scroll-mt-4"
    >
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{block.heading}</h3>
      <dl className="space-y-2 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">What it does</dt>
          <dd className="text-slate-700">{block.what}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Why it exists</dt>
          <dd className="text-slate-700">{block.why}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">How it works</dt>
          <dd className="text-slate-700">{block.how}</dd>
        </div>
        {block.formula && (
          <div>
            <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Formula</dt>
            <dd>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 border border-slate-200 p-2 font-mono text-[11px] text-slate-800">
                {block.formula}
              </pre>
            </dd>
          </div>
        )}
        {block.source && (
          <div>
            <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Computed in</dt>
            <dd className="font-mono text-[11px] text-slate-500">{block.source}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/// The center pane: the active section's title, blurb, and every block.
export function DocContent({ section }: { section: DocSection }) {
  return (
    <div data-testid={`doc-content-${section.id}`} className="flex-1 min-w-0 overflow-auto pl-4">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
        <p className="text-xs text-slate-600">{section.blurb}</p>
      </header>
      <div className="flex flex-col gap-3 pb-6">
        {section.blocks.map((b) => (
          <Block key={b.id} sectionId={section.id} block={b} />
        ))}
      </div>
    </div>
  );
}
