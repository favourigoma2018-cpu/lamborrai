/** True when the MetaMask extension injected provider is present (Polygon-only Lambor wallet). */
export function isMetaMaskAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const eth = (window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum;
  return Boolean(eth?.isMetaMask);
}
