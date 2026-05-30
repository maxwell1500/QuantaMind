import type { AnalysisDocument } from "./schema";

export function toJson(d: AnalysisDocument): string {
  return JSON.stringify(d, null, 2);
}
