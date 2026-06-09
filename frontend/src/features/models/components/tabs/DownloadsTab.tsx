import { StorageSection } from "../storage/StorageSection";
import { DownloadsActive } from "./DownloadsActive";
import { DownloadsInstalled } from "./DownloadsInstalled";

export function DownloadsTab() {
  return (
    <div data-testid="downloads-tab" className="flex flex-col gap-4 h-full">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Storage</h3>
        <StorageSection />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">In progress</h3>
        <DownloadsActive />
      </section>
      <section className="flex-1 min-h-0 flex flex-col gap-2">
        <h3 className="text-sm font-medium">Installed</h3>
        <div className="flex-1 overflow-auto">
          <DownloadsInstalled />
        </div>
      </section>
    </div>
  );
}
