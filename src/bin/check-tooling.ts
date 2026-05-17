#!/usr/bin/env node
import { runChecks } from "../lib/runner.js";

async function main(): Promise<void> {
  const target = process.argv[2] ?? process.cwd();
  let result;
  try {
    result = await runChecks(target);
  } catch (err) {
    console.error(`check-tooling: ${(err as Error).message}`);
    process.exit(2);
  }

  if (result.violations.length === 0) {
    console.log(`✔ check-tooling: ${target} passes all rules.`);
    process.exit(0);
  }

  const grouped = new Map<string, typeof result.violations>();
  for (const v of result.violations) {
    const arr = grouped.get(v.ruleId) ?? [];
    arr.push(v);
    grouped.set(v.ruleId, arr);
  }

  console.log(`check-tooling: ${target}`);
  console.log("");
  for (const [ruleId, vs] of grouped) {
    const sev = vs[0].severity === "warning" ? "⚠" : "✘";
    console.log(`${sev} [${ruleId}]`);
    for (const v of vs) {
      console.log(`    ${v.message}`);
      if (v.location) console.log(`      at ${v.location}`);
      console.log(`      → ${v.fix}`);
    }
    console.log("");
  }

  console.log(
    `Summary: ${result.errorCount} error(s), ${result.warningCount} warning(s).`,
  );
  console.log(
    "See NODE_TOOLING.md (in this package) for rationale and detailed fixes.",
  );

  process.exit(result.errorCount > 0 ? 1 : 0);
}

main();
