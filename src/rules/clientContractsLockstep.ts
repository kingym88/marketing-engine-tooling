import type { Rule, Violation } from "../lib/types.js";
import { CLIENT_RE, contractsPin } from "../lib/ecosystem.js";

/**
 * Client/contracts lockstep (Rule — structurally forbids the divergence that
 * caused this drift).
 *
 * The client is the HTTP SDK over the contract; the two must move together. The
 * convention is: the client package's own version EQUALS the contracts version
 * it implements. This rule fires only on the client package itself and fails
 * when its `version` differs from its pinned contracts version — so the client
 * can never be published implementing an older (or newer) contract than its
 * version number claims.
 */
export const clientContractsLockstep: Rule = {
  id: "client-contracts-lockstep",
  severity: "error",
  check({ packageJson }) {
    const name = packageJson.name;
    if (typeof name !== "string" || !CLIENT_RE.test(name)) return [];

    const version = packageJson.version;
    const pin = contractsPin(packageJson);
    if (typeof version !== "string" || !pin) return [];

    if (version !== pin) {
      const violation: Violation = {
        ruleId: this.id,
        severity: this.severity,
        message: `client version "${version}" must equal its pinned contracts version "${pin}" (lockstep). The client is the SDK over the contract; they move together.`,
        fix: `Set this package's "version" to "${pin}", or re-pin contracts and align both to the same number.`,
        location: "package.json:version",
      };
      return [violation];
    }
    return [];
  },
};
