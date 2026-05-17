export type Severity = "error" | "warning";

export interface Violation {
  ruleId: string;
  severity: Severity;
  message: string;
  fix: string;
  location?: string;
}

export interface RepoContext {
  /** Absolute path to the repo root being checked. */
  root: string;
  /** Parsed package.json contents. */
  packageJson: Record<string, unknown>;
  /** Raw contents of .gitignore, "" if absent. */
  gitignore: string;
  /** Absolute paths of any lockfiles present in the working tree. */
  lockfiles: {
    pnpm: boolean;
    npm: boolean;
    yarn: boolean;
  };
}

export interface Rule {
  id: string;
  /** "error" rules contribute to non-zero exit. "warning" rules report only. */
  severity: Severity;
  /** Returns 0+ violations. Never throws — file/parse errors should be
   *  caught at the framework level, not in individual rules. */
  check(ctx: RepoContext): Violation[] | Promise<Violation[]>;
}
