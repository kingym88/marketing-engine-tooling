import type { Rule } from "../lib/types.js";

export const pkgManagerDeclared: Rule = {
  id: "pkg-manager-declared",
  severity: "error",
  check({ packageJson }) {
    const value = packageJson.packageManager;
    if (typeof value !== "string" || value.trim() === "") {
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message: "package.json is missing the `packageManager` field.",
          fix: 'Add `"packageManager": "pnpm@10.33.2"` (or current ecosystem version) to package.json.',
        },
      ];
    }
    if (!/^pnpm@\d+\.\d+\.\d+/.test(value)) {
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message: `\`packageManager\` is "${value}" but must be pnpm@<exact-version>.`,
          fix: 'Pin to an exact pnpm version, e.g. "pnpm@10.33.2".',
        },
      ];
    }
    return [];
  },
};
