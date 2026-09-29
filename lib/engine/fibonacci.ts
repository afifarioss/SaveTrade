import type { Candle, Side } from "../types/trading";

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  direction: "UP" | "DOWN" | "NONE";
  levels: {
    23.6: number;
    38.2: number;
    50: number;
    61.8: number;
    78.6: number;
  };
}

export interface FibonacciConfluence {
  score: number;
  level: keyof FibonacciLevels["levels"] | null;
  distance: number | null;
  reason: string;
  levels: FibonacciLevels;
}

const RATIOS = [23.6, 38.2, 50, 61.8, 78.6] as const;

function buildLevels(
  low: number,
  high: number,
  direction: "UP" | "DOWN",
): FibonacciLevels {
  const range = high - low;

  const levels = {
    23.6:
      direction === "UP"
        ? high - range * 0.236
        : low + range * 0.236,
    38.2:
      direction === "UP"
        ? high - range * 0.382
        : low + range * 0.382,
    50:
      direction === "UP"
        ? high - range * 0.5
        : low + range * 0.5,
    61.8:
      direction === "UP"
        ? high - range * 0.618
        : low + range * 0.618,
    78.6:
      direction === "UP"
        ? high - range * 0.786
        : low + range * 0.786,
  };

  return {
    swingHigh: high,
    swingLow: low,
    direction,
    levels,
  };
}

export function calculateFibonacci(
  candles: Candle[],
  lookback = 100,
): FibonacciLevels {
  if (candles.length < 10) {
    return {
      swingHigh: 0,
      swingLow: 0,
      direction: "NONE",
      levels: {
        23.6: 0,
        38.2: 0,
        50: 0,
        61.8: 0,
        78.6: 0,
      },
    };
  }

  const start = Math.max(0, candles.length - lookback);
  const window = candles.slice(start);

  let highIndex = 0;
  let lowIndex = 0;

  for (let i = 1; i < window.length; i++) {
    if (window[i].high > window[highIndex].high) {
      highIndex = i;
    }

    if (window[i].low < window[lowIndex].low) {
      lowIndex = i;
    }
  }

  const swingHigh = window[highIndex].high;
  const swingLow = window[lowIndex].low;

  if (
    !Number.isFinite(swingHigh) ||
    !Number.isFinite(swingLow) ||
    swingHigh <= swingLow
  ) {
    return {
      swingHigh: 0,
      swingLow: 0,
      direction: "NONE",
      levels: {
        23.6: 0,
        38.2: 0,
        50: 0,
        61.8: 0,
        78.6: 0,
      },
    };
  }

  if (lowIndex < highIndex) {
    return buildLevels(
      swingLow,
      swingHigh,
      "UP",
    );
  }

  if (highIndex < lowIndex) {
    return buildLevels(
      swingLow,
      swingHigh,
      "DOWN",
    );
  }

  return {
    swingHigh,
    swingLow,
    direction: "NONE",
    levels: {
      23.6: 0,
      38.2: 0,
      50: 0,
      61.8: 0,
      78.6: 0,
    },
  };
}

export function calculateFibonacciConfluence(
  candles: Candle[],
  side: Side,
  atr: number,
): FibonacciConfluence {
  const levels = calculateFibonacci(candles);

  if (
    levels.direction === "NONE" ||
    atr <= 0 ||
    !Number.isFinite(atr)
  ) {
    return {
      score: 0,
      level: null,
      distance: null,
      reason: "No valid Fibonacci swing",
      levels,
    };
  }

  const price =
    candles[candles.length - 1]?.close ?? 0;

  const directionMatches =
    (side === "LONG" && levels.direction === "UP") ||
    (side === "SHORT" && levels.direction === "DOWN");

  if (!directionMatches) {
    return {
      score: 0,
      level: null,
      distance: null,
      reason: "Fibonacci direction conflicts with setup",
      levels,
    };
  }

  const tolerance = atr * 0.5;

  const candidates = RATIOS.map((ratio) => {
    const level = levels.levels[ratio];
    return {
      ratio,
      level,
      distance: Math.abs(price - level),
    };
  }).sort((a, b) => a.distance - b.distance);

  const nearest = candidates[0];

  if (nearest.distance > tolerance) {
    return {
      score: 0,
      level: null,
      distance: nearest.distance,
      reason: "No nearby Fibonacci confluence",
      levels,
    };
  }

  const scoreMap: Record<
    (typeof RATIOS)[number],
    number
  > = {
    23.6: 3,
    38.2: 9,
    50: 12,
    61.8: 15,
    78.6: 6,
  };

  const score = scoreMap[nearest.ratio];

  return {
    score,
    level: nearest.ratio,
    distance: nearest.distance,
    reason: `Fibonacci ${nearest.ratio}% confluence`,
    levels,
  };
}
