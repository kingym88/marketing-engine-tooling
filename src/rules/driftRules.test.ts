import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEcosystemCurrency, ecosystemPinsCurrent } from "./ecosystemPinsCurrent.js";
import { clientContractsLockstep } from "./clientContractsLockstep.js";
import type { RepoContext } from "../lib/types.js";

const ctx = (packageJson: Record<string, unknown>): RepoContext => ({
  root: "/tmp/x",
  packageJson,
  gitignore: "",
  lockfiles: { pnpm: true, npm: false, yarn: false },
});

// ── ecosystemPinsCurrent (currency) ─────────────────────────────────────────

test("currency: stale ecosystem pin is flagged", () => {
  const v = checkEcosystemCurrency(
    { dependencies: { "@kingym88/marketing-engine-contracts": "1.7.0" } },
    () => "1.9.0",
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /latest published is "1\.9\.0"/);
  assert.equal(v[0].ruleId, "ecosystem-pins-current");
});

test("currency: a current pin passes", () => {
  const v = checkEcosystemCurrency(
    { dependencies: { "@kingym88/marketing-engine-contracts": "1.9.0" } },
    () => "1.9.0",
  );
  assert.equal(v.length, 0);
});

test("currency: checks db + contracts + client, ignores unrelated deps", () => {
  const v = checkEcosystemCurrency(
    {
      dependencies: {
        "@kingym88/marketing-engine-db": "2.6.0", // stale
        "@kingym88/marketing-engine-contracts": "1.9.0", // current
        express: "4.19.2", // unrelated
      },
      devDependencies: { "@kingym88/marketing-engine-client": "1.7.0" }, // stale
    },
    (name) =>
      name.endsWith("-db") ? "2.7.0" : name.endsWith("-client") ? "1.9.0" : "1.9.0",
  );
  assert.equal(v.length, 2); // db + client stale; contracts current; express ignored
  assert.ok(v.every((x) => x.ruleId === "ecosystem-pins-current"));
});

test("currency: a registry lookup failure is itself an error (no silent pass)", () => {
  const v = checkEcosystemCurrency(
    { dependencies: { "@kingym88/marketing-engine-contracts": "1.9.0" } },
    () => {
      throw new Error("E404 not found");
    },
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /could not query the registry/);
});

test("currency: ranged pins are left to the exact-pin rules (skipped here)", () => {
  const v = checkEcosystemCurrency(
    { dependencies: { "@kingym88/marketing-engine-contracts": "^1.7.0" } },
    () => "1.9.0",
  );
  assert.equal(v.length, 0);
});

test("currency rule is opt-in: no-ops when the env flag is unset", async () => {
  // The currency flag is unset in the unit-test job (it's set only in the
  // separate CI gate step), so the rule must skip — no network — even with a
  // deliberately ancient pin. No process.env access here (the tooling's own
  // validated-env rule forbids it outside src/lib/env.ts).
  const v = await ecosystemPinsCurrent.check(
    ctx({ dependencies: { "@kingym88/marketing-engine-contracts": "0.0.1" } }),
  );
  assert.equal(v.length, 0);
});

// ── clientContractsLockstep ──────────────────────────────────────────────────

test("lockstep: client version must equal its contracts pin", async () => {
  const v = await clientContractsLockstep.check(
    ctx({
      name: "@kingym88/marketing-engine-client",
      version: "1.7.0",
      dependencies: { "@kingym88/marketing-engine-contracts": "1.9.0" },
    }),
  );
  assert.equal(v.length, 1);
  assert.match(v[0].message, /must equal its pinned contracts version "1\.9\.0"/);
});

test("lockstep: aligned client passes", async () => {
  const v = await clientContractsLockstep.check(
    ctx({
      name: "@kingym88/marketing-engine-client",
      version: "1.9.0",
      dependencies: { "@kingym88/marketing-engine-contracts": "1.9.0" },
    }),
  );
  assert.equal(v.length, 0);
});

test("lockstep: only applies to the client package", async () => {
  const v = await clientContractsLockstep.check(
    ctx({
      name: "@kingym88/marketing-engine-admin",
      version: "0.1.0",
      dependencies: { "@kingym88/marketing-engine-contracts": "1.9.0" },
    }),
  );
  assert.equal(v.length, 0); // not the client → not its concern
});
