import type {
  AccountState,
  Candle,
  Position,
  Side,
  Trade,
  StrategyVersion,
} from "../types/trading";

import { calculateRiskDecision } from "./risk";
import { SAFE_TRADE_CONFIG } from "../types/trading";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function applyEntrySlippage(
  price: number,
  side: Side,
): number {
  const rate = SAFE_TRADE_CONFIG.slippageRate;

  return side === "LONG"
    ? price * (1 + rate)
    : price * (1 - rate);
}

function applyExitSlippage(
  price: number,
  side: Side,
): number {
  const rate = SAFE_TRADE_CONFIG.slippageRate;

  return side === "LONG"
    ? price * (1 - rate)
    : price * (1 + rate);
}

function calculateFee(
  price: number,
  quantity: number,
): number {
  return price * quantity * SAFE_TRADE_CONFIG.feeRate;
}

export function openPaperPosition(
  account: AccountState,
  symbol: Position["symbol"],
  side: Side,
  candle: Candle,
  atr: number,
  signalScore: number,
  entryReferencePrice = candle.close,
  strategyVersion: StrategyVersion =
    SAFE_TRADE_CONFIG.strategyVersion,
): AccountState {
  const executionEntry = applyEntrySlippage(
    entryReferencePrice,
    side,
  );

  const risk = calculateRiskDecision(
    account,
    side,
    executionEntry,
    atr,
  );

  if (!risk.allowed) {
    return {
      ...account,
      botStatus: "WAITING",
    };
  }

  const entryFee = calculateFee(
    executionEntry,
    risk.quantity,
  );

  const position: Position = {
    id: createId("pos"),
    symbol,
    side,
    entryPrice: executionEntry,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    quantity: risk.quantity,
    riskAmount: risk.riskAmount,
    entryFee,
    openedAt: candle.timestamp,
    strategyVersion,
    signalScore,
  };

  return {
    ...account,
    balance: account.balance - entryFee,
    equity: account.equity - entryFee,
    dailyPnl: account.dailyPnl - entryFee,
    weeklyPnl: account.weeklyPnl - entryFee,
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

    if (
      exitPrice === null ||
      exitReason === null
    ) {
      remaining.push(position);
      continue;
    }

    const executionExit = applyExitSlippage(
      exitPrice,
      position.side,
    );

    const priceDifference =
      position.side === "LONG"
        ? executionExit - position.entryPrice
        : position.entryPrice - executionExit;

    const grossPnl =
      priceDifference * position.quantity;

    const exitFee = calculateFee(
      executionExit,
      position.quantity,
    );

    const pnl =
      grossPnl -
      position.entryFee -
      exitFee;

    const rMultiple =
      position.riskAmount > 0
        ? pnl / position.riskAmount
        : 0;

    const trade: Trade = {
      id: createId("trade"),
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: executionExit,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      quantity: position.quantity,
      riskAmount: position.riskAmount,
      entryFee: position.entryFee,
      exitFee,
      grossPnl,
      pnl,
      rMultiple,
      openedAt: position.openedAt,
      closedAt: candle.timestamp,
      exitReason,
      strategyVersion:
        position.strategyVersion,
      signalScore:
        position.signalScore,
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

  const latestTrade =
    closedTrades[closedTrades.length - 1];

  const consecutiveLosses =
    latestTrade.pnl < 0
      ? account.consecutiveLosses +
        closedTrades.filter(
          (trade) => trade.pnl < 0,
        ).length
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
