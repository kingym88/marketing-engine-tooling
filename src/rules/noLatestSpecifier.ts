import type { Rule, Violation } from "../lib/types.js";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export const noLatestSpecifier: Rule = {
  id: "no-latest-specifier",
  severity: "error",
  check({ packageJson }) {
    const violations: Violation[] = [];

    for (const field of DEP_FIELDS) {
      const deps = packageJson[field];
      if (!deps || typeof deps !== "object") continue;
      for (const [name, version] of Object.entries(
        deps as Record<string, unknown>,
      )) {
        if (version === "latest" || version === "*") {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message: `${field}["${name}"] = "${String(version)}" — wildcard specifiers are forbidden.`,
            fix: `Pin ${name} to an exact or caret version (e.g. "1.2.3" or "^1.2.3").`,
            location: `package.json:${field}.${name}`,
          });
        }
      }
    }

    return violations;
  },
};
