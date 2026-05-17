import type { Rule, Violation } from "../lib/types.js";

// Matches `npm` or `npx` as a standalone word (start of string, or preceded
// by whitespace / `&&` / `||` / `;` / `(` ).
const NPM_INVOCATION = /(?:^|[\s;&|()])(npm|npx)(?:\s|$)/;

export const noNpmInScripts: Rule = {
  id: "no-npm-in-scripts",
  severity: "error",
  check({ packageJson }) {
    const scripts = packageJson.scripts;
    if (!scripts || typeof scripts !== "object") return [];

    const violations: Violation[] = [];
    for (const [name, raw] of Object.entries(
      scripts as Record<string, unknown>,
    )) {
      if (typeof raw !== "string") continue;
      const match = raw.match(NPM_INVOCATION);
      if (match) {
        violations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `scripts["${name}"] invokes \`${match[1]}\` — use pnpm equivalents.`,
          fix: `Replace \`npm run X\` with \`pnpm run X\` and \`npx Y\` with \`pnpm exec Y\` in scripts["${name}"].`,
          location: `package.json:scripts.${name}`,
        });
      }
    }
    return violations;
  },
};
