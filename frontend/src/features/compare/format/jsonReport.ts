import type { CompareReport } from "./buildReport";

export function toJson(r: CompareReport): string {
  return JSON.stringify(r, null, 2);
}
