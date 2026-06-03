/// The Audit tab — Zone 2 (Automated Pipeline) compliance home: saved Matrix run
/// history, the audit-trail export, and the Context-Cliff diagnostic probe. A
/// shell for now; populated in Phase 5.
export function AuditPage() {
  return (
    <section data-testid="tab-audit" className="space-y-2">
      <h2 className="text-lg font-semibold">Audit</h2>
      <p data-testid="audit-empty" className="text-sm text-gray-500">
        Saved Performance Matrix history, audit-trail export, and the Context-Cliff
        diagnostic probe will live here.
      </p>
    </section>
  );
}
