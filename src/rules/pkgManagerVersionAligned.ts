import type { Rule } from "../lib/types.js";

/**
 * Rule 10 — packageManager version alignment across the ecosystem.
 *
 * A single-repo check can't see siblings, so this rule reports the
 * current repo's declared packageManager version as an INFO-style
 * warning. Cross-repo alignment is enforced externally (the
 * orchestrator that runs check-tooling across all ecosystem repos
 * compares the reported versions).
 *
 * The rule is `warning` severity so it doesn't affect exit status;
 * its purpose is to surface the version for downstream comparison,
 * not to fail in isolation.
 */
export const pkgManagerVersionAligned: Rule = {
  id: "pkg-manager-version-aligned",
  severity: "warning",
  check({ packageJson }) {
    const value = packageJson.packageManager;
    if (typeof value !== "string") return [];
    const match = value.match(/^pnpm@(\d+\.\d+\.\d+)/);
    if (!match) return [];
    return [
      {
        ruleId: this.id,
        severity: "warning",
        message: `Declared packageManager: pnpm@${match[1]}. Compare against sibling ecosystem repos.`,
        fix: "If sibling marketing-engine ecosystem repos declare a different pnpm version, align them. This rule is advisory; alignment is enforced by the cross-repo audit.",
      },
    ];
  },
};
