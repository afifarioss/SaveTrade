import { NextResponse } from "next/server";

import { fetchCandles } from "@/lib/market/market-data";
import {
  runBacktest,
  type BacktestStrategy,
} from "@/lib/engine/backtest";

import type { Symbol } from "@/lib/types/trading";

const VALID_SYMBOLS: Symbol[] = [
  "BTC/USDT",
  "ETH/USDT",
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedSymbol =
      searchParams.get("symbol") ?? "BTC/USDT";

    if (
      !VALID_SYMBOLS.includes(
        requestedSymbol as Symbol,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported symbol",
          supported: VALID_SYMBOLS,
        },
        { status: 400 },
      );
    }

    const symbol = requestedSymbol as Symbol;

    const requestedStrategy =
      searchParams.get("strategy") ??
      "trend-pullback";

    const VALID_STRATEGIES: BacktestStrategy[] = [
      "trend-pullback",
      "regime-momentum",
      "liquidity-reversion",
    ];

    if (
      !VALID_STRATEGIES.includes(
        requestedStrategy as BacktestStrategy,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported strategy",
          supported: VALID_STRATEGIES,
        },
        { status: 400 },
      );
    }

    const strategy =
      requestedStrategy as BacktestStrategy;

    const requestedCapital =
      searchParams.get("capital");

    const startingBalance =
      requestedCapital === null
        ? 100
        : Number(requestedCapital);

    if (
      !Number.isFinite(startingBalance) ||
      startingBalance <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid capital",
        },
        { status: 400 },
      );
    }

    const candles = await fetchCandles(
      symbol,
      "15m",
      1000,
    );

    if (candles.length < 200) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not enough historical candles",
        },
        { status: 400 },
      );
    }

    const result = runBacktest(
      symbol,
      candles,
      startingBalance,
      strategy,
    );

    return NextResponse.json({
      ok: true,
      mode: "PAPER",
      timeframe: "15m",
      candles: candles.length,
      startingBalance,
      strategy,
      result,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error(
      "SafeTrade backtest API error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Backtest failed",
      },
      { status: 500 },
    );
  }
}
