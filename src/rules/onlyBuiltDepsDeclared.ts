import type { Rule } from "../lib/types.js";

export const onlyBuiltDepsDeclared: Rule = {
  id: "only-built-deps-declared",
  severity: "error",
  check({ packageJson }) {
    const pnpmConfig = packageJson.pnpm as
      | Record<string, unknown>
      | undefined;
    if (!pnpmConfig || typeof pnpmConfig !== "object") {
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message: "package.json is missing the `pnpm` config block.",
          fix: 'Add `"pnpm": { "onlyBuiltDependencies": [] }` to package.json. Populate the array with packages your install genuinely needs to run scripts for (typically @prisma/client, @prisma/engines, esbuild, prisma, sharp).',
        },
      ];
    }
    if (!Array.isArray(pnpmConfig.onlyBuiltDependencies)) {
      return [
        {
          ruleId: this.id,
          severity: this.severity,
          message: "`pnpm.onlyBuiltDependencies` is missing or not an array.",
          fix: 'Add `"onlyBuiltDependencies": []` inside the `pnpm` block. Populate with whichever build-script-running packages this repo installs.',
        },
      ];
    }
    return [];
  },
};
