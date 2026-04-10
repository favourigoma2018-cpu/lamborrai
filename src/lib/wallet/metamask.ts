/**
 * MetaMask / injected wallet helpers (Polygon Lambor).
 * Mobile and multi-wallet setups often expose MetaMask only on `ethereum.providers[]`,
 * or inject `window.ethereum` shortly after load — not only as `ethereum.isMetaMask` on the root object.
 */

export type Eip1193ProviderLike = {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  /** Present when multiple wallets register (e.g. browser extension + MetaMask mobile bridge). */
  providers?: Eip1193ProviderLike[];
};

/**
 * Returns the EIP-1193 provider that belongs to MetaMask, if any.
 */
export function getMetaMaskProvider(): Eip1193ProviderLike | undefined {
  if (typeof window === "undefined") return undefined;
  const ethereum = (window as unknown as { ethereum?: Eip1193ProviderLike }).ethereum;
  if (!ethereum) return undefined;
  if (ethereum.isMetaMask) return ethereum;
  const list = ethereum.providers;
  if (Array.isArray(list) && list.length > 0) {
    const mm = list.find((p) => p?.isMetaMask);
    if (mm) return mm;
  }
  return undefined;
}

/** True when a MetaMask injected provider is present (extension or MetaMask mobile browser). */
export function isMetaMaskAvailable(): boolean {
  return getMetaMaskProvider() != null;
}
