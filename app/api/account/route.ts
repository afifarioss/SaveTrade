import { NextResponse } from "next/server";

import { createPaperAccount } from "@/lib/engine/account";

export async function GET() {
  const account = createPaperAccount();

  return NextResponse.json({
    ok: true,
    account: {
      mode: account.mode,
      status: account.botStatus,
      startingBalance: account.startingBalance,
      balance: account.balance,
      equity: account.equity,
      dailyPnl: account.dailyPnl,
      weeklyPnl: account.weeklyPnl,
      dailyTarget: 30,
      dailyTargetProgress: 0,
      openPositions: account.positions.length,
      completedTrades: account.trades.length,
      consecutiveLosses: account.consecutiveLosses,
    },
  });
}
