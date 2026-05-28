import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const LIMIT = 10;

// Enforces docs/folder-taxonomy.md: no source folder holds more than 10
// .ts/.tsx files. `__tests__` dirs are exempt — they mirror their source
// one-to-one, so their size is bounded by the (already-limited) source.
function collectOffenders(dir: string, acc: string[]): void {
  let count = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") collectOffenders(full, acc);
    } else if (/\.tsx?$/.test(name)) {
      count += 1;
    }
  }
  if (count > LIMIT) acc.push(`${dir} (${count} files)`);
}

describe("folder taxonomy", () => {
  it("no source folder exceeds 10 .ts/.tsx files", () => {
    const offenders: string[] = [];
    collectOffenders(SRC, offenders);
    expect(offenders).toEqual([]);
  });
});
