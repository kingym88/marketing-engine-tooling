import type { Rule, Violation } from "../lib/types.js";

/**
 * publishGuardPresent
 *
 * A package that publishes to GitHub Packages (identified by
 * publishConfig.registry) MUST wire a `prepublishOnly` script that runs the
 * shared publish guard. The guard refuses a local `pnpm publish` unless the
 * working tree is clean AND HEAD matches origin/main (CI bypasses it via
 * CI=true). Without it, anyone with a NODE_AUTH_TOKEN can push a version to the
 * registry whose source never landed on main — the exact failure that produced
 * the orphaned marketing-engine-contracts@1.4.0 and marketing-engine-client@1.2.0.
 *
 * The rule fires only when publishConfig.registry is present, so non-publishable
 * consumer repos (engine, coffee) are unaffected.
 */

/** The token we require to appear in the prepublishOnly script. */
const GUARD_TOKEN = "prepublish-guard";

export const publishGuardPresent: Rule = {
  id: "publish-guard-present",
  severity: "error",
  check({ packageJson }) {
    const publishConfig = packageJson.publishConfig;
    const registry =
      publishConfig && typeof publishConfig === "object"
        ? (publishConfig as Record<string, unknown>).registry
        : undefined;

    // Not a publishable package → rule is a no-op.
    if (typeof registry !== "string" || registry.length === 0) return [];

    const scripts = packageJson.scripts;
    const prepublishOnly =
      scripts && typeof scripts === "object"
        ? (scripts as Record<string, unknown>).prepublishOnly
        : undefined;

    const ok =
      typeof prepublishOnly === "string" && prepublishOnly.includes(GUARD_TOKEN);

    if (ok) return [];

    const violation: Violation = {
      ruleId: this.id,
      severity: this.severity,
      message:
        `Package publishes to "${registry}" but has no prepublishOnly publish guard. ` +
        `A local 'pnpm publish' could push a version whose source isn't on main ` +
        `(this is how contracts@1.4.0 and client@1.2.0 were orphaned).`,
      fix:
        `Add scripts.prepublishOnly running the shared guard, e.g. ` +
        `"prepublishOnly": "node scripts/prepublish-guard.mjs", and commit ` +
        `scripts/prepublish-guard.mjs (see NODE_TOOLING.md → Publish guard).`,
      location: "package.json:scripts.prepublishOnly",
    };
    return [violation];
  },
};
