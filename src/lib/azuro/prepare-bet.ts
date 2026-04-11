/**
 * Compatibility shim — import from `@/lib/azuro/prepareBet` in new code.
 * Keeps `@/lib/azuro/prepare-bet` working for older bet-slip / deploy trees.
 */
export type { PreparedBetInteraction, PreparedOrdinaryBet, SlipSelection } from "./prepareBet";
export { prepareBet, prepareBet as prepareBetInteraction } from "./prepareBet";
