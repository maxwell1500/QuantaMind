import { describe, it, expect } from "vitest";

const LIMIT = 10;

// Enforces docs/folder-taxonomy.md: no source folder holds more than 10
// .ts/.tsx files. Uses Vite's import.meta.glob (no node types needed, so
// `tsc` build stays green). `__tests__` dirs are exempt — they mirror
// their source one-to-one, so their size is already bounded.
const files = Object.keys(import.meta.glob("/src/**/*.{ts,tsx}"));

describe("folder taxonomy", () => {
  it("no source folder exceeds 10 .ts/.tsx files", () => {
    const counts: Record<string, number> = {};
    for (const path of files) {
      const dir = path.slice(0, path.lastIndexOf("/"));
      if (dir.endsWith("/__tests__")) continue;
      counts[dir] = (counts[dir] ?? 0) + 1;
    }
    const offenders = Object.entries(counts)
      .filter(([, n]) => n > LIMIT)
      .map(([dir, n]) => `${dir} (${n} files)`);
    expect(offenders).toEqual([]);
  });
});
