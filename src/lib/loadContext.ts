import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoContext } from "./types.js";

/**
 * Reads the structural inputs every rule needs from a repo root. Surface
 * is intentionally small so rules don't drift toward each one re-reading
 * package.json or scanning the filesystem.
 */
export async function loadRepoContext(root: string): Promise<RepoContext> {
  const absRoot = resolve(root);
  const pkgPath = join(absRoot, "package.json");

  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json at ${pkgPath}`);
  }

  const pkgRaw = await readFile(pkgPath, "utf8");
  let packageJson: Record<string, unknown>;
  try {
    packageJson = JSON.parse(pkgRaw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Could not parse ${pkgPath}: ${(err as Error).message}`);
  }

  const gitignorePath = join(absRoot, ".gitignore");
  const gitignore = existsSync(gitignorePath)
    ? await readFile(gitignorePath, "utf8")
    : "";

  return {
    root: absRoot,
    packageJson,
    gitignore,
    lockfiles: {
      pnpm: existsSync(join(absRoot, "pnpm-lock.yaml")),
      npm: existsSync(join(absRoot, "package-lock.json")),
      yarn: existsSync(join(absRoot, "yarn.lock")),
    },
  };
}
