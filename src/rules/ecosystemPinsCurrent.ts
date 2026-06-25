import type { Rule, Violation } from "../lib/types.js";
import { ECOSYSTEM_CURRENCY_ENV, ecosystemCurrencyCheckEnabled } from "../lib/env.js";
import { DEP_FIELDS, ECOSYSTEM_RE, EXACT_PIN_RE, latestPublishedVersion } from "../lib/ecosystem.js";

/**
 * Ecosystem pins must be CURRENT (Rule — closes the stale-pin drift hole).
 *
 * The exact-pin rules prove a pin has no range qualifier, but a repo can
 * exact-pin an OLD version forever and stay "green" while the package moves on —
 * which is how the client drifted to contracts@1.7.0 while contracts shipped
 * 1.9.0, silently stripping fields from every consumer that called through it.
 *
 * This rule fails when an exact-pinned ecosystem dependency (db / contracts /
 * client) is not the latest published version. It is OPT-IN via the
 * TOOLING_CHECK_ECOSYSTEM_CURRENT=1 env var (set in CI, where registry auth is
 * configured) so offline/local runs neither hang nor fail on the network — they
 * simply skip it. A registry-query failure WHEN enabled is itself an error
 * (CI must have auth), surfacing a mis-set-up gate rather than silently passing.
 */
const RULE_ID = "ecosystem-pins-current";

/**
 * Pure currency comparison (exported for tests). Iterates the exact-pinned
 * ecosystem deps and, using `latest(name)` to resolve the registry's latest
 * version, reports a violation for each stale pin (or for a registry lookup
 * that throws). `latest` is injected so this is testable without the network.
 */
export function checkEcosystemCurrency(
  packageJson: Record<string, unknown>,
  latest: (name: string) => string,
): Violation[] {
  const violations: Violation[] = [];
  for (const field of DEP_FIELDS) {
    const deps = packageJson[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
      if (!ECOSYSTEM_RE.test(name)) continue;
      if (typeof version !== "string" || !EXACT_PIN_RE.test(version)) continue;

      let latestVersion: string;
      try {
        latestVersion = latest(name);
      } catch (err) {
        violations.push({
          ruleId: RULE_ID,
          severity: "error",
          message: `${field}["${name}"]: could not query the registry for the latest version (${
            (err as Error).message.split("\n")[0]
          }). Ecosystem currency cannot be verified.`,
          fix: `Ensure the CI job has registry auth (.npmrc + NODE_AUTH_TOKEN) so \`npm view ${name} version\` succeeds, or unset ${ECOSYSTEM_CURRENCY_ENV} to skip.`,
          location: `package.json:${field}.${name}`,
        });
        continue;
      }

      if (latestVersion && version !== latestVersion) {
        violations.push({
          ruleId: RULE_ID,
          severity: "error",
          message: `${field}["${name}"] = "${version}" but the latest published is "${latestVersion}". Stale ecosystem pin → silent contract drift.`,
          fix: `Bump "${name}" to "${latestVersion}" and refresh the lockfile (pnpm install). For contracts+client this is lockstep — keep the client version equal to its contracts pin.`,
          location: `package.json:${field}.${name}`,
        });
      }
    }
  }
  return violations;
}

export const ecosystemPinsCurrent: Rule = {
  id: RULE_ID,
  severity: "error",
  async check({ packageJson }) {
    if (!ecosystemCurrencyCheckEnabled()) return [];
    return checkEcosystemCurrency(packageJson, latestPublishedVersion);
  },
};
