import type { Candle, Symbol } from "../types/trading";

const BINANCE_BASE_URL =
  "https://api.binance.com/api/v3/klines";

const SYMBOL_MAP: Record<Symbol, string> = {
  "BTC/USDT": "BTCUSDT",
  "ETH/USDT": "ETHUSDT",
};

interface BinanceKline {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: number;
}

export async function fetchCandles(
  symbol: Symbol,
  interval = "15m",
  limit = 500,
): Promise<Candle[]> {
  const exchangeSymbol = SYMBOL_MAP[symbol];

  const url = new URL(BINANCE_BASE_URL);

  url.searchParams.set(
    "symbol",
    exchangeSymbol,
  );

  url.searchParams.set(
    "interval",
    interval,
  );

  url.searchParams.set(
    "limit",
    String(Math.min(limit, 1000)),
  );

  const response = await fetch(
    url.toString(),
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Market data request failed: ${response.status}`,
    );
  }

  const data =
    (await response.json()) as BinanceKline[];

  return data.map((item) => ({
    timestamp: item[0],
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
  }));
}
