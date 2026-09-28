import { NextResponse } from "next/server";

import { fetchCandles } from "@/lib/market/market-data";
import { runBacktest } from "@/lib/engine/backtest";

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
    );

    return NextResponse.json({
      ok: true,
      mode: "PAPER",
      timeframe: "15m",
      candles: candles.length,
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
