export type ActiveBet = {
  id: string;
  match: string;
  amount: number;
  odds: number;
  strategy: string;
  placedAt: string;
};

export type BetHistoryItem = {
  id: string;
  match: string;
  result: string;
  pnl: number;
  strategy: string;
  resolvedAt: string;
};

export type RejectionItem = {
  id: string;
  match: string;
  confidence: number;
  reason: string;
  createdAt: string;
};

export type LamborSystemState = {
  isRunning: boolean;
  activeBets: ActiveBet[];
  history: BetHistoryItem[];
  rejections: RejectionItem[];
  strategyPerformance: Record<string, { bets: number; wins: number; losses: number; roi: number }>;
  updatedAt: string;
};

type GlobalWithState = typeof globalThis & { __lamborSystemState?: LamborSystemState };

function createInitialState(): LamborSystemState {
  return {
    isRunning: true,
    activeBets: [],
    history: [],
    rejections: [],
    strategyPerformance: {},
    updatedAt: new Date().toISOString(),
  };
}

function getStore(): LamborSystemState {
  const globalStore = globalThis as GlobalWithState;
  if (!globalStore.__lamborSystemState) {
    globalStore.__lamborSystemState = createInitialState();
  }
  return globalStore.__lamborSystemState;
}

export function getSystemState(): LamborSystemState {
  return getStore();
}

export function pauseSystem() {
  const store = getStore();
  store.isRunning = false;
  store.updatedAt = new Date().toISOString();
  return store;
}

export function resumeSystem() {
  const store = getStore();
  store.isRunning = true;
  store.updatedAt = new Date().toISOString();
  return store;
}

export function addActiveBet(bet: ActiveBet) {
  const store = getStore();
  store.activeBets = [bet, ...store.activeBets].slice(0, 50);
  store.updatedAt = new Date().toISOString();
  return store;
}

export function settleBet(id: string, result: string, pnl: number) {
  const store = getStore();
  const bet = store.activeBets.find((item) => item.id === id);
  store.activeBets = store.activeBets.filter((item) => item.id !== id);
  if (bet) {
    store.history = [
      {
        id: bet.id,
        match: bet.match,
        result,
        pnl,
        strategy: bet.strategy,
        resolvedAt: new Date().toISOString(),
      },
      ...store.history,
    ].slice(0, 200);

    const perf = store.strategyPerformance[bet.strategy] ?? { bets: 0, wins: 0, losses: 0, roi: 0 };
    perf.bets += 1;
    if (pnl >= 0) perf.wins += 1;
    else perf.losses += 1;
    perf.roi = Number(((perf.roi * (perf.bets - 1) + pnl) / perf.bets).toFixed(4));
    store.strategyPerformance[bet.strategy] = perf;
  }
  store.updatedAt = new Date().toISOString();
  return store;
}

export function addRejection(item: RejectionItem) {
  const store = getStore();
  store.rejections = [item, ...store.rejections].slice(0, 200);
  store.updatedAt = new Date().toISOString();
  return store;
}

export function getDailyPnl() {
  const store = getStore();
  const today = new Date().toDateString();
  return store.history
    .filter((item) => new Date(item.resolvedAt).toDateString() === today)
    .reduce((sum, item) => sum + item.pnl, 0);
}

export function getWinRate() {
  const store = getStore();
  const wins = store.history.filter((item) => item.pnl >= 0).length;
  const total = store.history.length;
  return total ? (wins / total) * 100 : 0;
}
