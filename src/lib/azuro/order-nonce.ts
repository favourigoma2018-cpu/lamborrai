/**
 * Azuro EIP-712 `nonce` is uint256 — value must be a decimal integer string only.
 * Strings like `Date.now() + "-" + random` fail viem with "failed to parse string to bigint".
 */
const BILLION = BigInt("1000000000");

export function azuroOrderNonce(): string {
  const t = BigInt(Date.now());
  const r = BigInt(Math.floor(Math.random() * 1_000_000_000));
  return (t * BILLION + r).toString();
}
