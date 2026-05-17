import type { Rule } from "../lib/types.js";

export const noEnginesNpm: Rule = {
  id: "no-engines-npm",
  severity: "error",
  check({ packageJson }) {
    const engines = packageJson.engines;
    if (!engines || typeof engines !== "object") return [];
    if ("npm" in (engines as Record<string, unknown>)) {
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message:
            "package.json has `engines.npm` set, which conflicts with the pnpm declaration in `packageManager`.",
          fix: "Remove the `engines.npm` field. Keep `engines.node` if you want a Node version floor.",
          location: "package.json:engines.npm",
        },
      ];
    }
    return [];
  },
};
