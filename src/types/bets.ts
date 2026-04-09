export type PlacedBetRecord = {
  id: string;
  createdAt: string;
  gameTitle: string;
  marketTitle: string;
  outcomeTitle: string;
  amount: string;
  odds: string;
  potentialPayout: string;
  status: "pending" | "success" | "failed";
  orderId?: string;
  txHash?: string;
  errorMessage?: string;
};
