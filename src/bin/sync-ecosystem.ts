#!/usr/bin/env node
/**
 * sync-ecosystem — bring a repo's ecosystem pins up to the latest published
 * versions, lockstep-aware. Used by the auto-re-pin workflow so drift is fixed
 * for you (a PR opens) rather than only flagged by the currency gate.
 *
 * What it does, against package.json in the target dir (default: cwd):
 *   1. For every exact-pinned ecosystem dep (db / contracts / client), look up
 *      the registry's latest and rewrite the pin if stale.
 *   2. If this repo IS the client package, align its own `version` to the
 *      (new) contracts pin — the client==contracts lockstep convention.
 *
 * Edits are done as targeted string replacements so existing package.json
 * formatting is preserved (no full re-serialise → no noisy diff). It does NOT
 * run the package manager; the workflow refreshes the lockfile and opens the PR.
 *
 * Output: a human-readable summary of changes on stdout, and a machine block
 * between `---changes---` markers (one `name old -> new` per line) for the PR
 * body. Exit 0 whether or not anything changed; exit 1 only on hard error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ECOSYSTEM_RE,
  CLIENT_RE,
  EXACT_PIN_RE,
  DEP_FIELDS,
  latestPublishedVersion,
  contractsPin,
} from "../lib/ecosystem.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace the FIRST `"<key>": "<from>"` occurrence, preserving whitespace. */
function replacePin(text: string, key: string, from: string, to: string): string {
  const re = new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*")${escapeRegExp(from)}(")`);
  return text.replace(re, `$1${to}$2`);
}

function main(): void {
  const target = process.argv[2] ?? process.cwd();
  const pkgPath = join(target, "package.json");
  let text: string;
  try {
    text = readFileSync(pkgPath, "utf8");
  } catch (err) {
    console.error(`sync-ecosystem: cannot read ${pkgPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const pkg = JSON.parse(text) as Record<string, unknown>;
  const changes: Array<{ name: string; from: string; to: string }> = [];

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
      if (!ECOSYSTEM_RE.test(name)) continue;
      if (typeof version !== "string" || !EXACT_PIN_RE.test(version)) continue;
      const latest = latestPublishedVersion(name);
      if (latest && latest !== version) {
        text = replacePin(text, name, version, latest);
        changes.push({ name, from: version, to: latest });
      }
    }
  }

  // Lockstep: if this is the client package, align its version to the (new)
  // contracts pin. Re-parse the patched text so we read the updated pin.
  if (CLIENT_RE.test(String((pkg as { name?: unknown }).name ?? ""))) {
    const patched = JSON.parse(text) as Record<string, unknown>;
    const pin = contractsPin(patched);
    const ver = patched.version;
    if (pin && typeof ver === "string" && ver !== pin) {
      text = replacePin(text, "version", ver, pin);
      changes.push({ name: "(client version → contracts lockstep)", from: ver, to: pin });
    }
  }

  if (changes.length === 0) {
    console.log("sync-ecosystem: all ecosystem pins are current.");
    return;
  }

  writeFileSync(pkgPath, text);
  console.log("sync-ecosystem: updated pins:");
  for (const c of changes) console.log(`  - ${c.name}: ${c.from} -> ${c.to}`);
  // Machine block for the PR body / step output.
  console.log("---changes---");
  for (const c of changes) console.log(`${c.name} ${c.from} -> ${c.to}`);
  console.log("---changes---");
}

main();
