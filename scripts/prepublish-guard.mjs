#!/usr/bin/env node
/**
 * Publish guard (shared across the marketing-engine ecosystem packages).
 *
 * Runs as the package's `prepublishOnly` script. Refuses a publish unless it is
 * provably tied to main:
 *   - In CI (CI=true): allowed. CI only runs the publish workflow on push to
 *     main and is the single sanctioned publisher.
 *   - Locally: allowed ONLY when the working tree is clean AND HEAD is the tip
 *     of origin/main. Otherwise it exits non-zero and blocks `pnpm publish`.
 *
 * This closes the gap that orphaned marketing-engine-contracts@1.4.0 and
 * marketing-engine-client@1.2.0: a local `pnpm publish` pushed a version whose
 * source never landed on main. The companion tooling rule `publish-guard-present`
 * fails CI if a publishable package drops this script.
 *
 * Override (rare, e.g. registry hotfix): set ALLOW_DIRTY_PUBLISH=1. Use only
 * with a written reason — it defeats the guard on purpose.
 */
import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fail(msg) {
  console.error(`\n[prepublish-guard] BLOCKED: ${msg}\n`);
  process.exit(1);
}

// CI is the sanctioned publisher (workflow runs only on push to main).
if (process.env.CI === "true") {
  console.log("[prepublish-guard] CI publish — allowed.");
  process.exit(0);
}

if (process.env.ALLOW_DIRTY_PUBLISH === "1") {
  console.warn("[prepublish-guard] ALLOW_DIRTY_PUBLISH=1 — guard bypassed deliberately.");
  process.exit(0);
}

// Local publish: must be a clean tree on the exact tip of origin/main.
try {
  const status = sh("git status --porcelain");
  if (status) {
    fail(
      "working tree is not clean. Commit or stash changes, merge to main, and let " +
        "CI publish.\nUncommitted:\n" + status,
    );
  }

  // Refresh the remote ref without merging, then compare.
  try {
    execSync("git fetch origin main --quiet", { stdio: "ignore" });
  } catch {
    fail("could not 'git fetch origin main' to verify HEAD matches main.");
  }

  const head = sh("git rev-parse HEAD");
  const originMain = sh("git rev-parse origin/main");
  if (head !== originMain) {
    fail(
      `HEAD (${head.slice(0, 8)}) is not the tip of origin/main (${originMain.slice(0, 8)}).\n` +
        "Publishing is only allowed from main via CI. Open a PR, merge it, and the " +
        "publish workflow will release the version.",
    );
  }

  console.log("[prepublish-guard] HEAD matches origin/main and tree is clean — allowed.");
  process.exit(0);
} catch (err) {
  // Never allow a publish to slip through on an unexpected guard error.
  fail(`guard error: ${err?.message ?? String(err)}`);
}
