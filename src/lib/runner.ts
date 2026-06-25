import { loadRepoContext } from "./loadContext.js";
import { RULES } from "../rules/index.js";
import type { Violation } from "./types.js";

export interface RunResult {
  violations: Violation[];
  errorCount: number;
  warningCount: number;
}

export interface RunOptions {
  /** When set, run ONLY rules whose id is in this list. Used by the
   *  workspace-member check (`--ecosystem-only`): the full standalone-repo
   *  contract (own lockfile / packageManager / env module) doesn't apply to a
   *  workspace sub-package, but ecosystem currency + lockstep still must. */
  ruleIds?: string[];
}

export async function runChecks(repoRoot: string, opts: RunOptions = {}): Promise<RunResult> {
  const ctx = await loadRepoContext(repoRoot);
  const rules = opts.ruleIds
    ? RULES.filter((r) => opts.ruleIds!.includes(r.id))
    : RULES;
  const all: Violation[] = [];
  for (const rule of rules) {
    const result = await rule.check(ctx);
    all.push(...result);
  }
  const errorCount = all.filter((v) => v.severity === "error").length;
  const warningCount = all.filter((v) => v.severity === "warning").length;
  return { violations: all, errorCount, warningCount };
}
