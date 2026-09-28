import { NextResponse } from "next/server";

import { fetchCandles } from "@/lib/market/market-data";
import { analyzeMarket } from "@/lib/engine/strategy";

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
      500,
    );

    const analysis = analyzeMarket(
      symbol,
      candles,
    );

    return NextResponse.json({
      ok: true,
      mode: "PAPER",
      symbol,
      timeframe: "15m",
      candles: candles.length,
      analysis,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("SafeTrade market API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to retrieve market data",
      },
      { status: 500 },
    );
  }
}
