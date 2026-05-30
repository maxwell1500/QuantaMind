import { HardwareSection } from "./HardwareSection";

/// Settings view. Hosts the Hardware section today; a home for future
/// app-level settings (theme, storage, etc.).
export function SettingsPage() {
  return (
    <div className="space-y-6" data-testid="settings">
      <HardwareSection />
    </div>
  );
}
