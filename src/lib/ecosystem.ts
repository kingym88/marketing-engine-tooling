import { execFileSync } from "node:child_process";

/**
 * Shared ecosystem-package helpers (used by the currency rule, the lockstep
 * rule, and the sync-ecosystem bin). One definition of "what is an ecosystem
 * package" and "what is its latest published version" so the gate and the
 * auto-sync can never disagree.
 */

/** Any (scoped) marketing-engine-{db,contracts,client} package. */
export const ECOSYSTEM_RE =
  /^(?:@[^/]+\/)?[^/]*marketing-engine-(?:db|contracts|client)$/;
export const CONTRACTS_RE = /^(?:@[^/]+\/)?[^/]*marketing-engine-contracts$/;
export const CLIENT_RE = /^(?:@[^/]+\/)?[^/]*marketing-engine-client$/;

/** Exact pin: numeric major.minor.patch (+ optional pre-release/build). */
export const EXACT_PIN_RE = /^\d+\.\d+\.\d+(?:[-+].+)?$/;

export const DEP_FIELDS = ["dependencies", "devDependencies"] as const;

/**
 * Latest published version of `name` from the registry. Read-only
 * `npm view` — uses the ambient .npmrc (scope→registry + auth) so it resolves
 * GitHub Packages exactly like install. npm ships with Node, so it's present
 * even in pnpm repos. Throws on lookup failure (callers decide how to surface).
 */
export function latestPublishedVersion(name: string): string {
  const out = execFileSync("npm", ["view", name, "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  return out.trim();
}

/** The exact contracts pin in a package.json, or null if absent/ranged. */
export function contractsPin(packageJson: Record<string, unknown>): string | null {
  for (const field of DEP_FIELDS) {
    const deps = packageJson[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
      if (CONTRACTS_RE.test(name) && typeof version === "string" && EXACT_PIN_RE.test(version)) {
        return version;
      }
    }
  }
  return null;
}
