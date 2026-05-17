import type { Rule, Violation } from "../lib/types.js";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const FORBIDDEN_PROTOCOLS = ["file:", "link:", "portal:"];

export const noFileDeps: Rule = {
  id: "no-file-deps",
  severity: "error",
  check({ packageJson }) {
    const violations: Violation[] = [];
    for (const field of DEP_FIELDS) {
      const deps = packageJson[field];
      if (!deps || typeof deps !== "object") continue;
      for (const [name, version] of Object.entries(
        deps as Record<string, unknown>,
      )) {
        if (typeof version !== "string") continue;
        const matched = FORBIDDEN_PROTOCOLS.find((p) => version.startsWith(p));
        if (matched) {
          violations.push({
            ruleId: this.id,
            severity: this.severity,
            message: `${field}["${name}"] = "${version}" uses the ${matched} protocol.`,
            fix: `Publish ${name} to the registry and depend on the published version. For temporary local dev, use \`pnpm link\` without committing the package.json change.`,
            location: `package.json:${field}.${name}`,
          });
        }
      }
    }
    return violations;
  },
};
