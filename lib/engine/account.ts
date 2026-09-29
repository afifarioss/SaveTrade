import {
  SAFE_TRADE_CONFIG,
} from "../types/trading";

import type {
  AccountState,
} from "../types/trading";

export function createPaperAccount(
  startingBalance = SAFE_TRADE_CONFIG.startingBalance,
): AccountState {
  return {
    startingBalance,
    balance: startingBalance,
    equity: startingBalance,
    dailyPnl: 0,
    weeklyPnl: 0,
    consecutiveLosses: 0,
    consecutiveLosingDays: 0,
    positions: [],
    trades: [],
    botStatus: "READY",
    mode: "PAPER",
  };
}
