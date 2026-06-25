import type { Rule } from "../lib/types.js";
import { pkgManagerDeclared } from "./pkgManagerDeclared.js";
import { singleLockfile } from "./singleLockfile.js";
import { noLatestSpecifier } from "./noLatestSpecifier.js";
import { onlyBuiltDepsDeclared } from "./onlyBuiltDepsDeclared.js";
import { noNpmInScripts } from "./noNpmInScripts.js";
import { noEnginesNpm } from "./noEnginesNpm.js";
import { validatedEnv } from "./validatedEnv.js";
import { engineDbExactPin } from "./engineDbExactPin.js";
import { contractsExactPin } from "./contractsExactPin.js";
import { noFileDeps } from "./noFileDeps.js";
import { pkgManagerVersionAligned } from "./pkgManagerVersionAligned.js";
import { publishGuardPresent } from "./publishGuardPresent.js";
import { ecosystemPinsCurrent } from "./ecosystemPinsCurrent.js";
import { clientContractsLockstep } from "./clientContractsLockstep.js";

/**
 * Declaration order is enforcement order. New rules append at the bottom
 * unless they replace an existing rule (in which case bump the package
 * major version per NODE_TOOLING.md versioning policy).
 */
export const RULES: Rule[] = [
  pkgManagerDeclared,
  singleLockfile,
  noLatestSpecifier,
  onlyBuiltDepsDeclared,
  noNpmInScripts,
  noEnginesNpm,
  validatedEnv,
  engineDbExactPin,
  contractsExactPin,
  noFileDeps,
  pkgManagerVersionAligned,
  publishGuardPresent,
  // Currency + lockstep (close the stale-pin drift hole). ecosystemPinsCurrent
  // is opt-in via TOOLING_CHECK_ECOSYSTEM_CURRENT=1 (CI only).
  ecosystemPinsCurrent,
  clientContractsLockstep,
];
