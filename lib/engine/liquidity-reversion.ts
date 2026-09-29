import { calculateIndicators } from "./indicators";

import type {
  Candle,
  SignalAnalysis,
  Symbol,
} from "../types/trading";

export const LIQUIDITY_REVERSION_VERSION =
  "ST-LIQUIDITY-REVERSION-1.0";

const CONFIG = {
  minCandles: 200,

  // Avoid fading strong trends.
  maxAdx: 25,

  // Mean-reversion thresholds.
  oversoldRsi: 35,
  overboughtRsi: 65,

  // Minimum displacement from EMA20 measured in ATRs.
  minDisplacementAtr: 0.75,

  // Confirmation must show the candle beginning to reverse.
  minimumBodyRatio: 0.20,

  // Signal confidence required by this strategy.
  threshold: 75,
};

function sma(
  values: number[],
  period: number,
): number {
  if (values.length < period) {
    return 0;
  }

  const slice = values.slice(-period);

  return (
    slice.reduce(
      (sum, value) => sum + value,
      0,
    ) / period
  );
}

function calculateAdx(
  candles: Candle[],
  period = 14,
): number {
  if (candles.length < period * 2 + 1) {
    return 0;
  }

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    tr.push(
      Math.max(
        current.high - current.low,
        Math.abs(
          current.high - previous.close,
        ),
        Math.abs(
          current.low - previous.close,
        ),
      ),
    );

    const upMove =
      current.high - previous.high;

    const downMove =
      previous.low - current.low;

    plusDm.push(
      upMove > downMove && upMove > 0
        ? upMove
        : 0,
    );

    minusDm.push(
      downMove > upMove && downMove > 0
        ? downMove
        : 0,
    );
  }

  const dx: number[] = [];

  for (
    let i = period - 1;
    i < tr.length;
    i++
  ) {
    const trSum = tr
      .slice(i - period + 1, i + 1)
      .reduce(
        (sum, value) => sum + value,
        0,
      );

    if (trSum <= 0) {
      continue;
    }

    const plusSum = plusDm
      .slice(i - period + 1, i + 1)
      .reduce(
        (sum, value) => sum + value,
        0,
      );

    const minusSum = minusDm
      .slice(i - period + 1, i + 1)
      .reduce(
        (sum, value) => sum + value,
        0,
      );

    const plusDi =
      (plusSum / trSum) * 100;

    const minusDi =
      (minusSum / trSum) * 100;

    const denominator =
      plusDi + minusDi;

    if (denominator <= 0) {
      continue;
    }

    dx.push(
      (Math.abs(
        plusDi - minusDi,
      ) /
        denominator) *
        100,
    );
  }

  if (dx.length < period) {
    return 0;
  }

  return sma(dx, period);
}

function clampScore(
  value: number,
): number {
  return Math.max(
    0,
    Math.min(100, Math.round(value)),
  );
}

export function analyzeLiquidityReversion(
  symbol: Symbol,
  candles: Candle[],
): SignalAnalysis {
  const timestamp =
    candles[candles.length - 1]?.timestamp ??
    Date.now();

  if (
    candles.length < CONFIG.minCandles
  ) {
    return {
      symbol,
      signal: "WAIT",
      score: 0,
      indicators: calculateIndicators(
        candles,
      ),
      reasons: [
        "Not enough candles for liquidity-reversion",
      ],
      timestamp,
    };
  }

  const indicators =
    calculateIndicators(candles);

  const current =
    candles[candles.length - 1];

  const previous =
    candles[candles.length - 2];

  const recentCloses = candles
    .slice(-21)
    .map((candle) => candle.close);

  const mean20 = sma(
    recentCloses,
    20,
  );

  const adx = calculateAdx(candles);

  if (
    !Number.isFinite(adx) ||
    !Number.isFinite(indicators.atr14) ||
    indicators.atr14 <= 0
  ) {
    return {
      symbol,
      signal: "WAIT",
      score: 0,
      indicators,
      reasons: [
        "Invalid volatility data",
      ],
      timestamp,
    };
  }

  /*
   * Strong trends are dangerous for mean reversion.
   */
  if (adx > CONFIG.maxAdx) {
    return {
      symbol,
      signal: "WAIT",
      score: 0,
      indicators,
      reasons: [
        `Trend strength too high: ADX ${adx.toFixed(1)}`,
      ],
      timestamp,
    };
  }

  const displacement =
    (current.close - mean20) /
    indicators.atr14;

  const body =
    Math.abs(
      current.close - current.open,
    );

  const range =
    current.high - current.low;

  const bodyRatio =
    range > 0
      ? body / range
      : 0;

  /*
   * LONG:
   *
   * Price is materially below its mean,
   * RSI is oversold,
   * and the latest candle begins reversing upward.
   */
  let longScore = 0;
  const longReasons: string[] = [];

  if (
    displacement <=
    -CONFIG.minDisplacementAtr
  ) {
    longScore += 25;
    longReasons.push(
      "Price is materially below its short-term mean",
    );
  }

  if (
    indicators.rsi14 <=
    CONFIG.oversoldRsi
  ) {
    longScore += 25;
    longReasons.push(
      `RSI is oversold: ${indicators.rsi14.toFixed(1)}`,
    );
  }

  if (
    current.close > current.open
  ) {
    longScore += 20;
    longReasons.push(
      "Current candle closes above its open",
    );
  }

  if (
    current.close > previous.close
  ) {
    longScore += 10;
    longReasons.push(
      "Price has started recovering",
    );
  }

  if (
    bodyRatio >=
    CONFIG.minimumBodyRatio
  ) {
    longScore += 10;
    longReasons.push(
      "Reversal candle has meaningful body",
    );
  }

  if (
    current.close > current.low +
      range * 0.60
  ) {
    longScore += 10;
    longReasons.push(
      "Close is positioned in the upper portion of the candle",
    );
  }

  /*
   * SHORT:
   *
   * Price is materially above its mean,
   * RSI is overbought,
   * and the latest candle begins reversing downward.
   */
  let shortScore = 0;
  const shortReasons: string[] = [];

  if (
    displacement >=
    CONFIG.minDisplacementAtr
  ) {
    shortScore += 25;
    shortReasons.push(
      "Price is materially above its short-term mean",
    );
  }

  if (
    indicators.rsi14 >=
    CONFIG.overboughtRsi
  ) {
    shortScore += 25;
    shortReasons.push(
      `RSI is overbought: ${indicators.rsi14.toFixed(1)}`,
    );
  }

  if (
    current.close < current.open
  ) {
    shortScore += 20;
    shortReasons.push(
      "Current candle closes below its open",
    );
  }

  if (
    current.close < previous.close
  ) {
    shortScore += 10;
    shortReasons.push(
      "Price has started falling back",
    );
  }

  if (
    bodyRatio >=
    CONFIG.minimumBodyRatio
  ) {
    shortScore += 10;
    shortReasons.push(
      "Reversal candle has meaningful body",
    );
  }

  if (
    current.close <=
    current.low + range * 0.40
  ) {
    shortScore += 10;
    shortReasons.push(
      "Close is positioned in the lower portion of the candle",
    );
  }

  const score = Math.max(
    longScore,
    shortScore,
  );

  if (
    score < CONFIG.threshold
  ) {
    return {
      symbol,
      signal: "WAIT",
      score: clampScore(score),
      indicators,
      reasons: [
        "Liquidity-reversion threshold not reached",
        ...(longScore >= shortScore
          ? longReasons
          : shortReasons),
      ],
      timestamp,
    };
  }

  if (
    longScore > shortScore
  ) {
    return {
      symbol,
      signal: "BUY",
      score: clampScore(longScore),
      indicators,
      reasons: longReasons,
      timestamp,
    };
  }

  if (
    shortScore > longScore
  ) {
    return {
      symbol,
      signal: "SELL",
      score: clampScore(shortScore),
      indicators,
      reasons: shortReasons,
      timestamp,
    };
  }

  return {
    symbol,
    signal: "WAIT",
    score: clampScore(score),
    indicators,
    reasons: [
      "No directional advantage",
    ],
    timestamp,
  };
}
