import {
  SAFE_TRADE_CONFIG,
} from "../types/trading";

import type {
  AccountState,
} from "../types/trading";

export function createPaperAccount(): AccountState {
  return {
    startingBalance: SAFE_TRADE_CONFIG.startingBalance,
    balance: SAFE_TRADE_CONFIG.startingBalance,
    equity: SAFE_TRADE_CONFIG.startingBalance,
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
