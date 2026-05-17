import type { Rule, Violation } from "../lib/types.js";

export const singleLockfile: Rule = {
  id: "single-lockfile",
  severity: "error",
  check({ lockfiles, gitignore }) {
    const violations: Violation[] = [];

    if (!lockfiles.pnpm) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message: "pnpm-lock.yaml is missing from the working tree.",
        fix: "Run `pnpm install` to generate it, then commit the file.",
      });
    }

    if (lockfiles.npm) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message: "package-lock.json exists in the working tree.",
        fix: "Delete package-lock.json. Ensure .gitignore lists it so it doesn't return.",
      });
    }

    if (lockfiles.yarn) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message: "yarn.lock exists in the working tree.",
        fix: "Delete yarn.lock. Ensure .gitignore lists it.",
      });
    }

    // Make sure pnpm-lock.yaml is NOT gitignored (it must be tracked).
    const pnpmLockGitignored = gitignore
      .split("\n")
      .map((l) => l.split("#")[0].trim())
      .some((l) => l === "pnpm-lock.yaml" || l === "/pnpm-lock.yaml");
    if (pnpmLockGitignored) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message:
          ".gitignore lists `pnpm-lock.yaml`, but the lockfile must be tracked in git.",
        fix: "Remove the `pnpm-lock.yaml` line from .gitignore. Add `package-lock.json` and `yarn.lock` lines instead, to defend against accidents.",
      });
    }

    return violations;
  },
};
