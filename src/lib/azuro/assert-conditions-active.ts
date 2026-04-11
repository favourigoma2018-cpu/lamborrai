import { ConditionState, getConditionsState, type ChainId } from "@azuro-org/toolkit";

/**
 * Live / prematch lines can go inactive between odds load and sign.
 * Azuro relayer returns "Condition is not active" — we check early with a clearer message.
 */
export async function assertAzuroConditionsActive(
  chainId: ChainId,
  conditionIds: string[],
): Promise<void> {
  const unique = [...new Set(conditionIds.filter(Boolean))];
  if (unique.length === 0) return;

  const rows = await getConditionsState({ chainId, conditionIds: unique });
  const byId = new Map(rows.map((r) => [r.conditionId, r]));

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      throw new Error("Could not verify this market on Azuro. Refresh the page and try again.");
    }
    if (row.state !== ConditionState.Active) {
      throw new Error(
        `Condition is not active (state: ${row.state}). Refresh the match and pick another open line.`,
      );
    }
  }
}
