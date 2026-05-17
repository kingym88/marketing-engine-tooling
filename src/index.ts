/**
 * Public API of @kingym88/marketing-engine-tooling.
 *
 * Most consumers will use the package via its CLI:
 *   pnpm exec check-tooling
 *
 * Programmatic access is exported for orchestration (e.g. a cross-repo
 * audit runner) and for unit tests in this package itself.
 */
export { runChecks } from "./lib/runner.js";
export { loadRepoContext } from "./lib/loadContext.js";
export { RULES } from "./rules/index.js";
export type { Rule, RepoContext, Violation, Severity } from "./lib/types.js";
