import { loadRepoContext } from "./loadContext.js";
import { RULES } from "../rules/index.js";
import type { Violation } from "./types.js";

export interface RunResult {
  violations: Violation[];
  errorCount: number;
  warningCount: number;
}

export async function runChecks(repoRoot: string): Promise<RunResult> {
  const ctx = await loadRepoContext(repoRoot);
  const all: Violation[] = [];
  for (const rule of RULES) {
    const result = await rule.check(ctx);
    all.push(...result);
  }
  const errorCount = all.filter((v) => v.severity === "error").length;
  const warningCount = all.filter((v) => v.severity === "warning").length;
  return { violations: all, errorCount, warningCount };
}
