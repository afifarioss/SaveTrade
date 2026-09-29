import type {
  AccountState,
  Candle,
  Symbol,
  Trade,
  StrategyVersion,
} from "../types/trading";

import { createPaperAccount } from "./account";
import { analyzeMarket } from "./strategy";
import { analyzeRegimeMomentum } from "./regime-momentum";
import { analyzeLiquidityReversion } from "./liquidity-reversion";
import {
  openPaperPosition,
  processPaperCandle,
} from "./paper-engine";

export interface BacktestResult {
  symbol: Symbol;
  startingBalance: number;
  endingBalance: number;
  netPnl: number;
  returnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  expectancyR: number;
  grossPnl: number;
  totalEntryFees: number;
  totalExitFees: number;
  totalFees: number;
  sameCandleExits: number;
  stopLossTrades: number;
  takeProfitTrades: number;

  longTrades: number;
  shortTrades: number;
  longWins: number;
  longLosses: number;
  shortWins: number;
  shortLosses: number;

  averageWinningR: number;
  averageLosingR: number;

  grossProfit: number;
  grossLoss: number;
  profitFactor: number;

  largestWin: number;
  largestLoss: number;
  averageTradePnl: number;

  feePercentOfGrossPnl: number;

  stopLossRate: number;
  takeProfitRate: number;

  signalScoreAverage: number;
  signalScoreWins: number;
  signalScoreLosses: number;

  sameCandleStopLosses: number;
  sameCandleTakeProfits: number;

  trades: Trade[];
}

function getUtcWeekKey(
  timestamp: number,
): string {
  const date = new Date(timestamp);

  const year = date.getUTCFullYear();
  const firstDay = new Date(
    Date.UTC(year, 0, 1),
  );

  const dayOfYear =
    Math.floor(
      (date.getTime() -
        firstDay.getTime()) /
        86400000,
    ) + 1;

  const week =
    Math.ceil(dayOfYear / 7);

  return `${year}-W${week}`;
}

export type BacktestStrategy =
  | "trend-pullback"
  | "regime-momentum"
  | "liquidity-reversion";

export const BACKTEST_STRATEGY_VERSIONS: Record<
  BacktestStrategy,
  StrategyVersion
> = {
  "trend-pullback": "ST-TREND-PULLBACK-1.0",
  "regime-momentum": "ST-REGIME-MOMENTUM-1.0",
  "liquidity-reversion": "ST-LIQUIDITY-REVERSION-2.0",
};

export function runBacktest(
  symbol: Symbol,
  candles: Candle[],
  startingBalance?: number,
  strategy: BacktestStrategy = "trend-pullback",
): BacktestResult {
  let account: AccountState =
    createPaperAccount(startingBalance);

  let peakEquity = account.equity;
  let maxDrawdown = 0;

  const minimumCandles = 200;

  /*
   * Backtest execution model:
   *
   * Candle N closes
   *     ↓
   * Analyze history through N
   *     ↓
   * Signal generated
   *     ↓
   * Candle N+1 opens
   *     ↓
   * Enter at N+1 open + execution slippage
   *     ↓
   * Manage SL/TP during N+1
   *
   * This prevents look-ahead bias.
   */

  for (
    let i = minimumCandles + 1;
    i < candles.length;
    i++
  ) {
    const currentCandle = candles[i];

    /*
     * Capture whether a position existed when this
     * candle opened.
     *
     * If it did, we must not re-enter during this
     * same candle after discovering that the position
     * was stopped or targeted.
     */
    const hadPositionAtOpen =
      account.positions.length > 0;

    /*
     * Reset daily/weekly risk budgets using UTC
     * exchange timestamps.
     */
    const previousCandle =
      candles[i - 1];

    const currentDay =
      new Date(
        currentCandle.timestamp,
      ).toISOString().slice(0, 10);

    const previousDay =
      new Date(
        previousCandle.timestamp,
      ).toISOString().slice(0, 10);

    const currentWeek =
      getUtcWeekKey(
        currentCandle.timestamp,
      );

    const previousWeek =
      getUtcWeekKey(
        previousCandle.timestamp,
      );

    if (currentDay !== previousDay) {
      account = {
        ...account,
        dailyPnl: 0,
        consecutiveLosses: 0,
        botStatus:
          account.botStatus === "SAFE_MODE"
            ? "READY"
            : account.botStatus,
      };
    }

    if (currentWeek !== previousWeek) {
      account = {
        ...account,
        weeklyPnl: 0,
      };
    }

    /*
     * First manage positions that were already open
     * before the current candle.
     */
    account = processPaperCandle(
      account,
      currentCandle,
    );

    /*
     * Only a position-free account at the OPEN of
     * the candle may create a new entry.
     */
    if (
      !hadPositionAtOpen &&
      account.positions.length === 0 &&
      account.botStatus !== "SAFE_MODE"
    ) {
      /*
       * The signal is based only on candles that were
       * completely closed before the entry candle.
       */
      const signalHistory = candles.slice(
        0,
        i,
      );

      const analysis =
        strategy === "regime-momentum"
          ? analyzeRegimeMomentum(
              symbol,
              signalHistory,
            )
          : strategy === "liquidity-reversion"
            ? analyzeLiquidityReversion(
                symbol,
                signalHistory,
              )
            : analyzeMarket(
                symbol,
                signalHistory,
              );

      if (
        analysis.signal === "BUY" ||
        analysis.signal === "SELL"
      ) {
        const side =
          analysis.signal === "BUY"
            ? "LONG"
            : "SHORT";

        /*
         * Entry is the NEXT candle's OPEN.
         * Slippage is applied inside openPaperPosition().
         */
        account = openPaperPosition(
          account,
          symbol,
          side,
          currentCandle,
          analysis.indicators.atr14,
          analysis.score,
          currentCandle.open,
          BACKTEST_STRATEGY_VERSIONS[strategy],
        );

      }
    }

    peakEquity = Math.max(
      peakEquity,
      account.equity,
    );

    const drawdown =
      peakEquity > 0
        ? ((peakEquity - account.equity) /
            peakEquity) *
          100
        : 0;

    maxDrawdown = Math.max(
      maxDrawdown,
      drawdown,
    );

    if (
      account.botStatus === "SAFE_MODE"
    ) {
      break;
    }
  }

  const trades = account.trades;

  const winningTrades = trades.filter(
    (trade) => trade.pnl > 0,
  ).length;

  const losingTrades = trades.filter(
    (trade) => trade.pnl < 0,
  ).length;

  const totalTrades = trades.length;

  const winRate =
    totalTrades > 0
      ? (winningTrades / totalTrades) * 100
      : 0;

  const averageR =
    totalTrades > 0
      ? trades.reduce(
          (sum, trade) =>
            sum + trade.rMultiple,
          0,
        ) / totalTrades
      : 0;

  const averageWinR =
    winningTrades > 0
      ? trades
          .filter(
            (trade) => trade.pnl > 0,
          )
          .reduce(
            (sum, trade) =>
              sum + trade.rMultiple,
            0,
          ) / winningTrades
      : 0;

  const averageLossR =
    losingTrades > 0
      ? Math.abs(
          trades
            .filter(
              (trade) => trade.pnl < 0,
            )
            .reduce(
              (sum, trade) =>
                sum + trade.rMultiple,
              0,
            ) / losingTrades,
        )
      : 0;

  const expectancyR =
    (winRate / 100) * averageWinR -
    ((100 - winRate) / 100) *
      averageLossR;

  const grossPnl =
    trades.reduce(
      (sum, trade) =>
        sum + trade.grossPnl,
      0,
    );

  const totalEntryFees =
    trades.reduce(
      (sum, trade) =>
        sum + trade.entryFee,
      0,
    );

  const totalExitFees =
    trades.reduce(
      (sum, trade) =>
        sum + trade.exitFee,
      0,
    );

  const totalFees =
    totalEntryFees +
    totalExitFees;

  const sameCandleExits =
    trades.filter(
      (trade) =>
        trade.openedAt === trade.closedAt,
    ).length;

  const stopLossTrades =
    trades.filter(
      (trade) =>
        trade.exitReason === "STOP_LOSS",
    ).length;

  const takeProfitTrades =
    trades.filter(
      (trade) =>
        trade.exitReason === "TAKE_PROFIT",
    ).length;

  const netPnl =
    account.balance -
    account.startingBalance;

  const returnPercent =
    account.startingBalance > 0
      ? (netPnl /
          account.startingBalance) *
        100
      : 0;

  const longTrades =
    trades.filter(
      (trade) => trade.side === "LONG",
    ).length;

  const shortTrades =
    trades.filter(
      (trade) => trade.side === "SHORT",
    ).length;

  const longWins =
    trades.filter(
      (trade) =>
        trade.side === "LONG" &&
        trade.pnl > 0,
    ).length;

  const longLosses =
    trades.filter(
      (trade) =>
        trade.side === "LONG" &&
        trade.pnl < 0,
    ).length;

  const shortWins =
    trades.filter(
      (trade) =>
        trade.side === "SHORT" &&
        trade.pnl > 0,
    ).length;

  const shortLosses =
    trades.filter(
      (trade) =>
        trade.side === "SHORT" &&
        trade.pnl < 0,
    ).length;

  const averageWinningR =
    winningTrades > 0
      ? trades
          .filter(
            (trade) => trade.pnl > 0,
          )
          .reduce(
            (sum, trade) =>
              sum + trade.rMultiple,
            0,
          ) / winningTrades
      : 0;

  const averageLosingR =
    losingTrades > 0
      ? Math.abs(
          trades
            .filter(
              (trade) => trade.pnl < 0,
            )
            .reduce(
              (sum, trade) =>
                sum + trade.rMultiple,
              0,
            ) / losingTrades,
        )
      : 0;

  const grossProfit =
    trades
      .filter(
        (trade) => trade.pnl > 0,
      )
      .reduce(
        (sum, trade) =>
          sum + trade.pnl,
        0,
      );

  const grossLoss =
    Math.abs(
      trades
        .filter(
          (trade) => trade.pnl < 0,
        )
        .reduce(
          (sum, trade) =>
            sum + trade.pnl,
          0,
        ),
    );

  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Infinity
        : 0;

  const largestWin =
    winningTrades > 0
      ? Math.max(
          ...trades
            .filter(
              (trade) => trade.pnl > 0,
            )
            .map(
              (trade) => trade.pnl,
            ),
        )
      : 0;

  const largestLoss =
    losingTrades > 0
      ? Math.min(
          ...trades
            .filter(
              (trade) => trade.pnl < 0,
            )
            .map(
              (trade) => trade.pnl,
            ),
        )
      : 0;

  const averageTradePnl =
    totalTrades > 0
      ? netPnl / totalTrades
      : 0;

  const feePercentOfGrossPnl =
    Math.abs(grossPnl) > 0
      ? (totalFees /
          Math.abs(grossPnl)) *
        100
      : 0;

  const stopLossRate =
    totalTrades > 0
      ? (stopLossTrades / totalTrades) *
        100
      : 0;

  const takeProfitRate =
    totalTrades > 0
      ? (takeProfitTrades / totalTrades) *
        100
      : 0;

  const signalScoreAverage =
    totalTrades > 0
      ? trades.reduce(
          (sum, trade) =>
            sum + trade.signalScore,
          0,
        ) / totalTrades
      : 0;

  const signalScoreWins =
    winningTrades > 0
      ? trades
          .filter(
            (trade) => trade.pnl > 0,
          )
          .reduce(
            (sum, trade) =>
              sum + trade.signalScore,
            0,
          ) / winningTrades
      : 0;

  const signalScoreLosses =
    losingTrades > 0
      ? trades
          .filter(
            (trade) => trade.pnl < 0,
          )
          .reduce(
            (sum, trade) =>
              sum + trade.signalScore,
            0,
          ) / losingTrades
      : 0;

  const sameCandleStopLosses =
    trades.filter(
      (trade) =>
        trade.openedAt === trade.closedAt &&
        trade.exitReason === "STOP_LOSS",
    ).length;

  const sameCandleTakeProfits =
    trades.filter(
      (trade) =>
        trade.openedAt === trade.closedAt &&
        trade.exitReason === "TAKE_PROFIT",
    ).length;

  return {
    symbol,
    startingBalance:
      account.startingBalance,
    endingBalance: account.balance,
    netPnl,
    returnPercent,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    averageR,
    maxDrawdown,
    expectancyR,
    grossPnl,
    totalEntryFees,
    totalExitFees,
    totalFees,
    sameCandleExits,
    stopLossTrades,
    takeProfitTrades,

    longTrades,
    shortTrades,
    longWins,
    longLosses,
    shortWins,
    shortLosses,

    averageWinningR,
    averageLosingR,

    grossProfit,
    grossLoss,
    profitFactor,

    largestWin,
    largestLoss,
    averageTradePnl,

    feePercentOfGrossPnl,

    stopLossRate,
    takeProfitRate,

    signalScoreAverage,
    signalScoreWins,
    signalScoreLosses,

    sameCandleStopLosses,
    sameCandleTakeProfits,

    trades,
  };
}
