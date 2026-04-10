export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_HEX = "0x89";

export const POLYGON_CHAIN_PARAMS = {
  chainId: POLYGON_CHAIN_HEX,
  chainName: "Polygon Mainnet",
  nativeCurrency: {
    name: "MATIC",
    symbol: "MATIC",
    decimals: 18,
  },
  rpcUrls: ["https://polygon-rpc.com"],
  blockExplorerUrls: ["https://polygonscan.com"],
} as const;

