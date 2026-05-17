import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Rule, Violation } from "../lib/types.js";

/**
 * Rule 7 — every repo MUST have a central env validation module, and code
 * outside it MUST NOT read process.env directly.
 *
 * Scope:
 *  - Walks files under src/ matching {ts,tsx,js,jsx,mjs,cjs}.
 *  - DOES NOT read .env, .env.*, *.key, *.pem, credentials.json, secrets.yaml.
 *    These are explicitly excluded from the file walk as a defensive
 *    measure, even though they don't match the source-code extension list.
 *  - The env module itself is the only place process.env reads are allowed.
 *    Located by convention at src/lib/env.ts.
 *  - process.env.NODE_ENV and process.env.DEBUG are universally tolerated
 *    (framework-conventional). Anything else outside the env module is a
 *    violation.
 *  - Files under scripts/ (build/migration utilities run outside the app)
 *    are also tolerated — they run before the env module loads.
 *  - next.config.* and *.config.* (vite, vitest, etc.) are tolerated for
 *    the same reason.
 */

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const ENV_MODULE_CANDIDATES = [
  "src/lib/env.ts",
  "src/lib/env.tsx",
  "src/env.ts",
  "src/lib/env/index.ts",
];

// Files / dirs we never read or descend into, regardless of extension.
// First line of defence; second line is the extension allow-list.
const SECRET_PATHS = new Set([
  ".env",
  "credentials.json",
  "secrets.yaml",
]);
const SECRET_PREFIXES = [".env."];
const SECRET_SUFFIXES = [".key", ".pem"];

// Directories never descended into.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  "coverage",
  ".turbo",
  // Generated code (e.g. Prisma client output) is not authored — process.env
  // reads inside it are the generator's concern, not the consumer's.
  "generated",
]);

// Path segments under which process.env reads are tolerated.
// Anything matching these is exempted regardless of file content.
const TOLERATED_PATH_PARTS = [
  // scripts/ at any depth — build/migration utilities
  `${sep}scripts${sep}`,
  // build-tool config files at root
];
const TOLERATED_FILENAMES = new Set([
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.ts",
  "vite.config.js",
  "vitest.config.ts",
  "vitest.config.js",
  "vitest.unit.config.ts",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.mjs",
]);

const TOLERATED_ENV_VARS = new Set(["NODE_ENV", "DEBUG"]);

// Matches process.env.X or process.env["X"] reads. Captures the var name.
const PROCESS_ENV_RE = /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;

function isSecretFilename(name: string): boolean {
  if (SECRET_PATHS.has(name)) return true;
  if (SECRET_PREFIXES.some((p) => name.startsWith(p))) return true;
  if (SECRET_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return false;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    // Defensive: skip anything that looks like a secret file BEFORE checking
    // extension. Extension check below would also exclude these, but belt
    // and braces.
    if (isSecretFilename(entry.name)) continue;
    const dot = entry.name.lastIndexOf(".");
    if (dot === -1) continue;
    const ext = entry.name.slice(dot);
    if (!SOURCE_EXTS.has(ext)) continue;
    out.push(full);
  }
}

function isTolerated(relPath: string): boolean {
  const filename = relPath.split(sep).pop() ?? "";
  if (TOLERATED_FILENAMES.has(filename)) return true;
  // tolerate filename like next.config.* / vitest.config.* not in the explicit list
  if (/^(next|vite|vitest|tailwind|postcss|drizzle)\.config\.[mc]?[jt]sx?$/.test(filename)) {
    return true;
  }
  for (const part of TOLERATED_PATH_PARTS) {
    if (relPath.includes(part)) return true;
  }
  return false;
}

function isEnvModule(relPath: string, envModulePath: string | null): boolean {
  if (!envModulePath) return false;
  return relPath === envModulePath;
}

export const validatedEnv: Rule = {
  id: "validated-env",
  severity: "error",
  async check({ root }): Promise<Violation[]> {
    const violations: Violation[] = [];
    const srcDir = join(root, "src");
    if (!existsSync(srcDir)) {
      // No src/ at all — not applicable. Don't fail; the rule presumes a
      // src-organised repo. If this becomes a common false-negative we can
      // tighten later.
      return [];
    }
    try {
      await stat(srcDir);
    } catch {
      return [];
    }

    // Locate the env module, if any.
    const envModulePath = ENV_MODULE_CANDIDATES.find((rel) =>
      existsSync(join(root, rel)),
    ) ?? null;

    const files: string[] = [];
    await walk(srcDir, files);

    // First pass: find direct process.env reads outside tolerated locations.
    // Only flag if the read is plausibly code (not a comment or a string).
    const directReadViolations: Violation[] = [];
    for (const abs of files) {
      const rel = relative(root, abs);
      if (isEnvModule(rel, envModulePath)) continue;
      if (isTolerated(rel)) continue;
      // Self-exclusion: the rule definitions themselves describe the
      // process.env pattern as a string. They are not runtime reads.
      if (rel.includes(`src${sep}rules${sep}validatedEnv`)) continue;

      let contents: string;
      try {
        contents = await readFile(abs, "utf8");
      } catch {
        continue;
      }
      // Strip line comments and block comments so a commented-out
      // process.env.X doesn't count. (Not a full parser; covers the
      // common cases without bringing in a TS AST.)
      const stripped = contents
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // Strip simple string literals: anything in single/double/backtick
      // quotes on a single line. Catches the "process.env.X" patterns
      // that appear in rule descriptions and tests. Not perfect (multi-
      // line template literals slip through) but kills the false-positive
      // class that bit the self-check.
      const stringless = stripped
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, "``");

      const re = new RegExp(PROCESS_ENV_RE.source, "g");
      const seen = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = re.exec(stringless)) !== null) {
        const name = match[1] ?? match[2];
        if (!name) continue;
        if (TOLERATED_ENV_VARS.has(name)) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        directReadViolations.push({
          ruleId: this.id,
          severity: this.severity,
          message: `${rel} reads process.env.${name} directly.`,
          fix: `Import this value from the env module instead. Add ${name} to the env module's Zod schema if missing.`,
          location: rel,
        });
      }
    }

    // If no direct reads anywhere, the repo doesn't need an env module
    // at all (e.g. a pure CLI tool that takes args, not env vars). Pass.
    if (directReadViolations.length === 0) {
      return [];
    }

    // Otherwise: there ARE direct reads. Whether they're violations
    // depends on whether an env module exists for them to be moved into.
    if (!envModulePath) {
      violations.push({
        ruleId: this.id,
        severity: this.severity,
        message:
          "No env validation module found, but process.env is read across the codebase. Expected one of: " +
          ENV_MODULE_CANDIDATES.join(", "),
        fix: "Create src/lib/env.ts exporting a Zod-parsed `env` object. Replace the process.env reads listed below with imports from that module.",
      });
    }

    violations.push(...directReadViolations);
    return violations;
  },
};
