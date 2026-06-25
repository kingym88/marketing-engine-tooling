/**
 * Centralised environment access for the tooling package.
 *
 * The tooling enforces a `validated-env` rule (process.env must be read in one
 * module, not scattered), so it dogfoods the same discipline: this is the only
 * file that reads process.env.
 */

/** Env var that opts CI into the registry-backed ecosystem-currency check. */
export const ECOSYSTEM_CURRENCY_ENV = "TOOLING_CHECK_ECOSYSTEM_CURRENT";

/**
 * Whether the registry-backed ecosystem-currency check is enabled. It is
 * opt-in (set to "1" only in CI, where registry auth exists) so local/offline
 * runs of check-tooling never hit the network.
 */
export function ecosystemCurrencyCheckEnabled(): boolean {
  return process.env[ECOSYSTEM_CURRENCY_ENV] === "1";
}
