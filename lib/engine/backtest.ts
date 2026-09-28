import type {
  AccountState,
  Candle,
  Symbol,
  Trade,
} from "../types/trading";

import { createPaperAccount } from "./account";
import { calculateIndicators } from "./indicators";
import { analyzeMarket } from "./strategy";
import { openPaperPosition, processPaperCandle } from "./paper-engine";

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
  trades: Trade[];
}

export function runBacktest(
  symbol: Symbol,
  candles: Candle[],
): BacktestResult {
  let account: AccountState = createPaperAccount();

  let peakBalance = account.balance;
  let maxDrawdown = 0;

  const minimumCandles = 200;

  for (
    let i = minimumCandles;
    i < candles.length;
    i++
  ) {
    const history = candles.slice(0, i + 1);
    const currentCandle = candles[i];

    account = processPaperCandle(
      account,
      currentCandle,
    );

    if (
      account.positions.length === 0 &&
      account.botStatus !== "SAFE_MODE"
    ) {
      const analysis = analyzeMarket(
        symbol,
        history,
      );

      if (
        analysis.signal === "BUY" ||
        analysis.signal === "SELL"
      ) {
        const side =
          analysis.signal === "BUY"
            ? "LONG"
            : "SHORT";

        account = openPaperPosition(
          account,
          symbol,
          side,
          currentCandle,
          analysis.indicators.atr14,
          analysis.score,
        );
      }
    }

    peakBalance = Math.max(
      peakBalance,
      account.balance,
    );

    const drawdown =
      peakBalance > 0
        ? ((peakBalance - account.equity) /
            peakBalance) *
          100
        : 0;

    maxDrawdown = Math.max(
      maxDrawdown,
      drawdown,
    );

    if (account.botStatus === "SAFE_MODE") {
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
          (sum, trade) => sum + trade.rMultiple,
          0,
        ) / totalTrades
      : 0;

  const averageWinR =
    winningTrades > 0
      ? trades
          .filter((trade) => trade.pnl > 0)
          .reduce(
            (sum, trade) => sum + trade.rMultiple,
            0,
          ) / winningTrades
      : 0;

  const averageLossR =
    losingTrades > 0
      ? Math.abs(
          trades
            .filter((trade) => trade.pnl < 0)
            .reduce(
              (sum, trade) => sum + trade.rMultiple,
              0,
            ) / losingTrades,
        )
      : 0;

  const expectancyR =
    (winRate / 100) * averageWinR -
    ((100 - winRate) / 100) * averageLossR;

  const netPnl =
    account.balance -
    account.startingBalance;

  const returnPercent =
    account.startingBalance > 0
      ? (netPnl / account.startingBalance) * 100
      : 0;

  return {
    symbol,
    startingBalance: account.startingBalance,
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
    trades,
  };
}
