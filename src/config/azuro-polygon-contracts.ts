import { chainsData } from "@azuro-org/toolkit";

import { AZURO_CHAIN_ID } from "@/config/chain";

/** Polygon mainnet Azuro deployment — single source for addresses + PayMaster ABI. */
const chain = chainsData[AZURO_CHAIN_ID];

export const azuroPolygonContracts = chain.contracts;

export const PAYMASTER_ADDRESS = chain.contracts.paymaster.address;

/** Full PayMaster ABI from `@azuro-org/toolkit` (depositFor, withdraw, withdrawPayouts, views). */
export const PAYMASTER_ABI = chain.contracts.paymaster.abi;

export const BET_TOKEN = chain.betToken;
