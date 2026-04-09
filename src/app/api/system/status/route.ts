import { NextResponse } from "next/server";

import { getDailyPnl, getSystemState, getWinRate } from "@/lib/telegram/system-state";

export async function GET() {
  const state = getSystemState();
  return NextResponse.json(
    {
      isRunning: state.isRunning,
      activeBets: state.activeBets,
      history: state.history.slice(0, 10),
      rejections: state.rejections.slice(0, 10),
      strategyPerformance: state.strategyPerformance,
      openBets: state.activeBets.length,
      dailyPnl: getDailyPnl(),
      winRate: getWinRate(),
      updatedAt: state.updatedAt,
    },
    { status: 200 },
  );
}
