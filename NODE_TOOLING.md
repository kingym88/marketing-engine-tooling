# Node Tooling Contract

Authoritative tooling rules for the Wakiru marketing-engine ecosystem.

## Scope

This contract applies to every Node.js repository that participates in the
marketing-engine ecosystem:

- **`wakiru-marketing-engine`** — the engine itself (deployed once per brand
  or once globally with brand routing)
- **per-brand database packages** — currently `wakiru-marketing-engine-db`;
  future examples might include `surftrackpro-marketing-engine-db`,
  `acme-marketing-engine-db`, etc.
- **brand-owned consumer apps** — currently `wakiru-coffee`; one per brand,
  owned by the brand, hands over with the brand engagement

Standalone projects that do not interact with the marketing engine
ecosystem are out of scope.

## Why this contract exists

Three repos (and growing) sharing tooling decisions implicitly led to
recurring production drift. Specific incidents the contract closes off:

- **2026-05-17**: A version bump to `@kingym88/marketing-engine-db` in
  `pnpm-lock.yaml` (gitignored, used locally) silently diverged from
  `package-lock.json` (tracked, used by Railway CI), causing the coffee
  deploy to fail with `EUSAGE`. Fixed by §3 of the brand-kit work plan;
  rule (2) prevents recurrence.
- Multiple files in `wakiru-marketing-engine` are pinned to `"latest"`
  (e.g. `@anthropic-ai/sdk`, `@google-cloud/storage`, `bullmq`), creating
  unpredictable behaviour changes on every fresh install. Rule (3)
  prevents recurrence.
- `gcpCredentials.ts` and `socialInteractionStatus.ts` exist as
  character-identical duplicates across `wakiru-coffee` and
  `wakiru-marketing-engine`. While not addressed by this contract
  directly, the same publishing pattern this package uses is the
  recommended fix path (track this work separately).

## The rules

Each rule has a stable ID. The `check-tooling` script reports violations
by ID so they can be cross-referenced here.

---

### `pkg-manager-declared` (rule 1)

The `packageManager` field in `package.json` MUST be present and pinned
to an exact version of pnpm.

**Why**: Without this, Railway's Railpack and similar auto-detection
tools fall back to npm. That leads to multiple lockfiles, drift between
local and CI installs, and the exact failure mode we hit on 2026-05-17.

**Fix**: Add to `package.json`:
```json
"packageManager": "pnpm@10.33.2"
```
Use whatever specific pnpm version the rest of the ecosystem is on.

---

### `single-lockfile` (rule 2)

`pnpm-lock.yaml` MUST be tracked in git. `package-lock.json` and
`yarn.lock` MUST NOT exist in the working tree.

**Why**: Two lockfiles for two package managers will silently drift the
moment one is updated without the other. The drift is invisible until
the deploy that runs the second manager fails.

**Fix**: Delete any extra lockfiles. Update `.gitignore` to forbid them.
Track `pnpm-lock.yaml`.

---

### `no-latest-specifier` (rule 3)

No `dependencies` or `devDependencies` entry may use `"latest"` as its
version specifier.

**Why**: `"latest"` is a moving target. The version installed on Monday
may differ from Tuesday. The version installed in CI may differ from
the version installed locally. This is incompatible with reproducible
builds.

**Fix**: Pin to a real version. If you genuinely want bleeding-edge,
pin to the current bleeding-edge version explicitly and bump it
deliberately when you decide to.

---

### `only-built-deps-declared` (rule 4)

The `pnpm.onlyBuiltDependencies` field MUST be present in `package.json`
(even if empty).

**Why**: pnpm v10+ refuses to run install scripts for packages not
explicitly approved. If the list is absent, pnpm prompts interactively
and (in v11) may write a `pnpm-workspace.yaml` prompt-stub into the
working tree. Both behaviours break CI and pollute commits.

**Fix**: Add to `package.json`, with whichever packages your install
genuinely needs to run scripts for:
```json
"pnpm": {
  "onlyBuiltDependencies": [
    "@prisma/client",
    "@prisma/engines",
    "esbuild",
    "prisma",
    "sharp"
  ]
}
```

---

### `no-npm-in-scripts` (rule 5)

Entries in `scripts` MUST NOT reference `npm` or `npx`. Use `pnpm` or
`pnpm exec` instead.

**Why**: A repo that declares `packageManager: pnpm@*` but then runs
`npm run foo` in its scripts requires both managers to be installed at
runtime. Inconsistency causes confusion and makes tooling decisions
harder to enforce.

**Fix**: Replace `npm run foo` with `pnpm run foo`. Replace `npx bar`
with `pnpm exec bar`.

---

### `no-engines-npm` (rule 6)

The `engines.npm` field MUST NOT be present in `package.json`. If
`engines.node` is present, it should not contradict the Node version
implied by `packageManager`.

**Why**: An `engines.npm` constraint signals to tooling that npm is the
expected manager, which contradicts the `packageManager: pnpm@*`
declaration in rule 1. The two together cause confusing warnings during
install.

**Fix**: Remove the `engines.npm` field. Keep `engines.node` if you
want, but ensure it's compatible with what your pnpm version supports.

---

### `validated-env` (rule 7)

Every repo MUST have an env validation module that parses
`process.env` through a Zod (or equivalent) schema, and every other
file in the repo MUST read env vars through that module rather than
directly via `process.env.*`.

**Why**: Direct `process.env` reads scattered throughout a codebase
produce a class of bug where the first request after deploy throws
because a required env var was missed in the deployment config. A
validated env module fails at startup with a clear error message.

**Fix**: Create `src/lib/env.ts` (or equivalent) exporting a parsed,
typed `env` object. Replace `process.env.X` with `env.X` across the
codebase. The check script flags `process.env.` reads outside the
env module itself.

**Scope notes**: Next.js `next.config.*` files and build-time scripts
under a `scripts/` directory are exempt because they run before the env
module loads.

---

### `engine-db-exact-pin` (rule 8)

Any dependency matching `*-marketing-engine-db` (the schema package for
a given brand) MUST be exact-version pinned, not caret-pinned. So
`"1.3.2"`, not `"^1.3.2"`.

**Why**: The marketing-engine-db package is the cross-repo schema
contract. A patch release (e.g. adding a column) can ripple to every
consumer on the next install. Exact pinning forces deliberate upgrades
in lockstep with whatever code change the consumer needs to make.

**Fix**: Edit `package.json`, change `"^1.3.2"` to `"1.3.2"`. Run
`pnpm install` to refresh the lockfile.

---

### `contracts-exact-pin` (rule 9)

Any dependency matching `*-marketing-engine-contracts` (the shared Zod schemas /
helpers package) MUST be exact-version pinned, not caret-pinned or range-pinned.
So `"1.0.0"`, not `"^1.0.0"`.

**Why**: The contracts package defines the job-data schemas and platform constants
shared by every consumer (engine, workers, admin UI). A minor-version bump can
change schema shapes, status enums, or HMAC verifier signatures. Exact pinning
forces every consumer to upgrade deliberately and in lockstep rather than picking
up breaking changes silently on the next install.

**Fix**: Edit `package.json`, change `"^1.0.0"` to `"1.0.0"`. Run
`pnpm install` to refresh the lockfile.

---

### `no-file-deps` (rule 10)

No `dependencies` or `devDependencies` entry may use a `file:` or
`link:` protocol referring to a local filesystem path.

**Why**: File-protocol dependencies work on the author's machine but
break for anyone else. They're a common dev-time shortcut that gets
forgotten before commit and breaks handover.

**Fix**: Publish the local package properly and depend on the
published version, or use pnpm's `link` for temporary local
development (without committing the change).

---

### `pkg-manager-version-aligned` (rule 11)

Within the marketing-engine ecosystem, the `packageManager` version
declared in `package.json` SHOULD match across:

- `wakiru-marketing-engine`
- any `*-marketing-engine-db` package it talks to

This is currently advisory (warning, not error) because cross-repo
version coordination is operationally heavy. The check script reports
mismatches but does not exit non-zero for them.

**Why**: pnpm lockfile format is stable across recent minor versions,
but bug-fix patches differ. Same major.minor across repos in an
ecosystem reduces "works on my machine" delta.

---

## How violations are reported

Run from a consuming repo:

```bash
pnpm exec check-tooling
```

Each violation prints as:

```
[<rule-id>] <human-readable description>
  → <how to fix, with the specific file/line if known>
```

The script exits non-zero if any rule (1–10) is violated. Rule 11 is a
warning and does not affect exit status.

## Adopting the contract

1. Install: `pnpm add -D @kingym88/marketing-engine-tooling`
2. Run `pnpm exec check-tooling` and fix what it reports.
3. Drop the CI workflow template from `node_modules/@kingym88/marketing-engine-tooling/workflows/tooling-check.yml`
   into `.github/workflows/` to enforce on every PR.

## Versioning of this contract

- Patch bumps: bug fixes to the check script, doc improvements.
- Minor bumps: new rules added (consumers see new violations they need
  to fix; not breaking in the sense that old rules still apply).
- Major bumps: rules removed, rules made stricter in incompatible ways,
  or the check script's exit-code semantics change.

When a consumer's `check-tooling` run reports new violations after a
minor bump, fixing them is a normal maintenance task.
