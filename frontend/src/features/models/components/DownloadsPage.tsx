import { DownloadsTab } from "./tabs/DownloadsTab";

export function DownloadsPage() {
  return (
    <section data-testid="page-downloads" className="flex flex-col gap-3 h-full">
      <h2 className="text-lg font-semibold">Downloads</h2>
      <DownloadsTab />
    </section>
  );
}
