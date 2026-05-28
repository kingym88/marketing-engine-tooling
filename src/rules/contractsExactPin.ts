import type { Rule, Violation } from "../lib/types.js";

const DEP_FIELDS = ["dependencies", "devDependencies"] as const;
// Matches package names ending in "-marketing-engine-contracts", with or without
// a scope prefix. Captures the (scope/)package.
const CONTRACTS_RE = /^(?:@[^/]+\/)?[^/]*marketing-engine-contracts$/;

// Exact-pin: numeric major.minor.patch with no range qualifier.
// Allows pre-release / build metadata: 1.2.3, 1.2.3-beta.1, 1.2.3+sha.abc.
const EXACT_PIN_RE = /^\d+\.\d+\.\d+(?:[-+].+)?$/;

export const contractsExactPin: Rule = {
  id: "contracts-exact-pin",
  severity: "error",
  check({ packageJson }) {
    const violations: Violation[] = [];
    for (const field of DEP_FIELDS) {
      const deps = packageJson[field];
      if (!deps || typeof deps !== "object") continue;
      for (const [name, version] of Object.entries(
        deps as Record<string, unknown>,
      )) {
        if (!CONTRACTS_RE.test(name)) continue;
        if (typeof version !== "string") continue;
        if (!EXACT_PIN_RE.test(version)) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message: `${field}["${name}"] = "${version}" must be exact-pinned (no ^, ~, ranges, 'latest'). Found: ${version}`,
            fix: `Pin to an exact version, e.g. "${version.replace(/^[\^~]/, "")}".`,
            location: `package.json:${field}.${name}`,
          });
        }
      }
    }
    return violations;
  },
};
