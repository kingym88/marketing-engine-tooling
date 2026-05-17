# @kingym88/marketing-engine-tooling

Shared Node tooling contract for the Wakiru marketing-engine ecosystem.

Enforces a small set of rules across every repo in the ecosystem
(`wakiru-marketing-engine`, per-brand `*-marketing-engine-db` packages,
and brand-owned consumer apps like `wakiru-coffee`). Closes off classes
of bug that have caused real production drama — lockfile drift,
unpinned dependencies, accidental package-manager mixing, missing env
validation.

The full contract and rationale lives in [NODE_TOOLING.md](./NODE_TOOLING.md).

## Install

```bash
pnpm add -D @kingym88/marketing-engine-tooling
```

## Use

```bash
pnpm exec check-tooling
```

Pass a target directory to check a different repo:

```bash
pnpm exec check-tooling /path/to/other/repo
```

Exits non-zero if any error-severity rule is violated. Warnings (e.g.
the cross-repo packageManager alignment check) are reported but do not
affect exit status.

## CI enforcement

Drop this into `.github/workflows/` of the consuming repo:

```
node_modules/@kingym88/marketing-engine-tooling/workflows/tooling-check.yml
```

It runs `check-tooling` on every PR.

## What gets checked

See [NODE_TOOLING.md](./NODE_TOOLING.md) for the full list. In brief
(v1.0.0):

1. `pkg-manager-declared` — `packageManager: pnpm@<exact>` in package.json
2. `single-lockfile` — only `pnpm-lock.yaml` tracked
3. `no-latest-specifier` — no `"latest"` / `"*"` dep versions
4. `only-built-deps-declared` — `pnpm.onlyBuiltDependencies` present
5. `no-npm-in-scripts` — scripts use `pnpm` not `npm` / `npx`
6. `no-engines-npm` — no `engines.npm` field
7. `validated-env` — central env validation module, no raw `process.env` reads
8. `engine-db-exact-pin` — `*-marketing-engine-db` deps must be exact-pinned
9. `no-file-deps` — no `file:` / `link:` / `portal:` deps
10. `pkg-manager-version-aligned` — *advisory* warning showing the declared
    pnpm version for cross-repo comparison

## Versioning

- **Patch** — bug fixes to the check script, doc improvements.
- **Minor** — new rules added. Consumers see new violations they need to fix.
- **Major** — rules removed or made stricter in incompatible ways.

When bumping, edit `version` in `package.json` manually and push. CI
publishes the new version if it isn't already on the registry; otherwise
the publish step is a no-op.

## Programmatic use

```ts
import { runChecks } from "@kingym88/marketing-engine-tooling";

const result = await runChecks("/path/to/repo");
console.log(result.violations);
console.log(result.errorCount, "errors,", result.warningCount, "warnings");
```

Mostly useful for cross-repo audit orchestration.

## Adding a new rule

1. Create `src/rules/<ruleId>.ts` exporting a `Rule` object.
2. Add it to the `RULES` array in `src/rules/index.ts`.
3. Document it in `NODE_TOOLING.md` (rule sections, plus the rules-list
   in this README).
4. Bump `version` in `package.json` — minor if the rule is purely additive,
   major if it changes behaviour of existing rules.
5. Push to main. CI publishes.

## Self-test

```bash
pnpm install
pnpm build
pnpm exec tsx src/bin/check-tooling.ts .
```

The package must pass its own rules. CI runs this automatically.

## Scope

Applies to Node.js repositories that participate in the marketing-engine
ecosystem. Standalone projects (e-commerce sites that don't use the
engine, internal tools unrelated to marketing) are out of scope.
