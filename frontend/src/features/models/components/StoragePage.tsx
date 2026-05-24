import { StorageTab } from "./tabs/StorageTab";

export function StoragePage() {
  return (
    <section data-testid="page-storage" className="flex flex-col gap-3 h-full">
      <h2 className="text-lg font-semibold">Storage</h2>
      <StorageTab />
    </section>
  );
}
