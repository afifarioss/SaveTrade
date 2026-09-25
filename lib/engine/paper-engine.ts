import type {
  AccountState,
  Candle,
  Position,
  Side,
  Trade,
} from "../types/trading";

import { calculateRiskDecision } from "./risk";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function openPaperPosition(
  account: AccountState,
  symbol: Position["symbol"],
  side: Side,
  candle: Candle,
  atr: number,
  signalScore: number,
): AccountState {
  const risk = calculateRiskDecision(
    account,
    side,
    candle.close,
    atr,
  );

  if (!risk.allowed) {
    return {
      ...account,
      botStatus: "WAITING",
    };
  }

  const position: Position = {
    id: createId("pos"),
    symbol,
    side,
    entryPrice: candle.close,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    quantity: risk.quantity,
    riskAmount: risk.riskAmount,
    openedAt: candle.timestamp,
    strategyVersion: `ST-TREND-PULLBACK-1.0:${signalScore}`,
  };

  return {
    ...account,
    positions: [
      ...account.positions,
      position,
    ],
    botStatus: "IN_POSITION",
  };
}

export function processPaperCandle(
  account: AccountState,
  candle: Candle,
): AccountState {
  if (account.positions.length === 0) {
    return account;
  }

  const remaining: Position[] = [];
  const closedTrades: Trade[] = [];

  for (const position of account.positions) {
    if (
      position.symbol !== "BTC/USDT" &&
      position.symbol !== "ETH/USDT"
    ) {
      remaining.push(position);
      continue;
    }

    let exitPrice: number | null = null;
    let exitReason: Trade["exitReason"] | null = null;

    if (position.side === "LONG") {
      const stopHit =
        candle.low <= position.stopLoss;

      const targetHit =
        candle.high >= position.takeProfit;

      if (stopHit && targetHit) {
        // Conservative assumption:
        // when both occur inside one candle,
        // assume the stop was hit first.
        exitPrice = position.stopLoss;
        exitReason = "STOP_LOSS";
      } else if (stopHit) {
        exitPrice = position.stopLoss;
        exitReason = "STOP_LOSS";
      } else if (targetHit) {
        exitPrice = position.takeProfit;
        exitReason = "TAKE_PROFIT";
      }
    }

    if (position.side === "SHORT") {
      const stopHit =
        candle.high >= position.stopLoss;

      const targetHit =
        candle.low <= position.takeProfit;

      if (stopHit && targetHit) {
        exitPrice = position.stopLoss;
        exitReason = "STOP_LOSS";
      } else if (stopHit) {
        exitPrice = position.stopLoss;
        exitReason = "STOP_LOSS";
      } else if (targetHit) {
        exitPrice = position.takeProfit;
        exitReason = "TAKE_PROFIT";
      }
    }

    if (
      exitPrice === null ||
      exitReason === null
    ) {
      remaining.push(position);
      continue;
    }

    const priceDifference =
      position.side === "LONG"
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;

    const pnl =
      priceDifference * position.quantity;

    const rMultiple =
      position.riskAmount > 0
        ? pnl / position.riskAmount
        : 0;

    const trade: Trade = {
      id: createId("trade"),
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      quantity: position.quantity,
      riskAmount: position.riskAmount,
      pnl,
      rMultiple,
      openedAt: position.openedAt,
      closedAt: candle.timestamp,
      exitReason,
      strategyVersion: position.strategyVersion,
      signalScore: Number(
        position.strategyVersion.split(":")[1] ?? 0,
      ),
    };

    closedTrades.push(trade);
  }

  if (closedTrades.length === 0) {
    return account;
  }

  const totalPnl = closedTrades.reduce(
    (sum, trade) => sum + trade.pnl,
    0,
  );

  const losses = closedTrades.filter(
    (trade) => trade.pnl < 0,
  );

  const wins = closedTrades.filter(
    (trade) => trade.pnl > 0,
  );

  const latestTrade =
    closedTrades[closedTrades.length - 1];

  const consecutiveLosses =
    latestTrade.pnl < 0
      ? account.consecutiveLosses + losses.length
      : 0;

  const nextBalance =
    account.balance + totalPnl;

  let botStatus = account.botStatus;

  if (consecutiveLosses >= 3) {
    botStatus = "SAFE_MODE";
  } else if (remaining.length === 0) {
    botStatus = "READY";
  }

  return {
    ...account,
    balance: nextBalance,
    equity: nextBalance,
    dailyPnl: account.dailyPnl + totalPnl,
    weeklyPnl: account.weeklyPnl + totalPnl,
    consecutiveLosses,
    positions: remaining,
    trades: [
      ...account.trades,
      ...closedTrades,
    ],
    botStatus,
  };
}
