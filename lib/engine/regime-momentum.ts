import { calculateIndicators } from "./indicators";
import { SAFE_TRADE_CONFIG } from "../types/trading";

import type {
  Candle,
  SignalAnalysis,
  Symbol,
} from "../types/trading";

export const REGIME_MOMENTUM_VERSION =
  "ST-REGIME-MOMENTUM-1.0";

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
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
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

    if (trSum <= 0) {
      dx.push(0);
      continue;
    }

    const plusDi =
      (plusSum / trSum) * 100;

    const minusDi =
      (minusSum / trSum) * 100;

    const denominator =
      plusDi + minusDi;

    dx.push(
      denominator > 0
        ? (Math.abs(
            plusDi - minusDi,
          ) /
            denominator) *
            100
        : 0,
    );
  }

  if (dx.length < period) {
    return 0;
  }

  const recent = dx.slice(-period);

  return (
    recent.reduce(
      (sum, value) => sum + value,
      0,
    ) / recent.length
  );
}

function calculateRoc(
  candles: Candle[],
  period = 10,
): number {
  if (candles.length <= period) {
    return 0;
  }

  const current =
    candles[candles.length - 1].close;

  const previous =
    candles[candles.length - 1 - period]
      .close;

  return previous > 0
    ? ((current - previous) / previous) * 100
    : 0;
}

function highestPrevious(
  candles: Candle[],
  period: number,
): number {
  const recent = candles.slice(
    -(period + 1),
    -1,
  );

  return recent.length > 0
    ? Math.max(
        ...recent.map(
          (candle) => candle.high,
        ),
      )
    : 0;
}

function lowestPrevious(
  candles: Candle[],
  period: number,
): number {
  const recent = candles.slice(
    -(period + 1),
    -1,
  );

  return recent.length > 0
    ? Math.min(
        ...recent.map(
          (candle) => candle.low,
        ),
      )
    : 0;
}

function calculateAtr(
  candles: Candle[],
  period = 14,
): number {
  if (candles.length <= period) {
    return 0;
  }

  const ranges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(
          current.high -
            previous.close,
        ),
        Math.abs(
          current.low -
            previous.close,
        ),
      ),
    );
  }

  const recent =
    ranges.slice(-period);

  return (
    recent.reduce(
      (sum, value) => sum + value,
      0,
    ) / recent.length
  );
}

export function analyzeRegimeMomentum(
  symbol: Symbol,
  candles: Candle[],
): SignalAnalysis {
  const timestamp =
    candles[candles.length - 1]
      ?.timestamp ?? Date.now();

  if (candles.length < 220) {
    return {
      symbol,
      signal: "WAIT",
      score: 0,
      indicators:
        calculateIndicators(candles),
      reasons: [
        "Not enough candle history",
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

  const adx =
    calculateAdx(candles);

  const roc =
    calculateRoc(candles);

  const atr =
    calculateAtr(candles);

  const priorHigh =
    highestPrevious(candles, 20);

  const priorLow =
    lowestPrevious(candles, 20);

  let longScore = 0;
  let shortScore = 0;

  const longReasons: string[] = [];
  const shortReasons: string[] = [];

  const bullishRegime =
    current.close >
      indicators.ema200 &&
    indicators.ema50 >
      indicators.ema200;

  const bearishRegime =
    current.close <
      indicators.ema200 &&
    indicators.ema50 <
      indicators.ema200;

  // 25 — market regime
  if (bullishRegime) {
    longScore += 25;
    longReasons.push(
      "Bullish market regime",
    );
  }

  if (bearishRegime) {
    shortScore += 25;
    shortReasons.push(
      "Bearish market regime",
    );
  }

  // 20 — ADX trend strength
  if (adx >= 25) {
    if (bullishRegime) {
      longScore += 20;
      longReasons.push(
        `Strong trend (ADX ${adx.toFixed(1)})`,
      );
    }

    if (bearishRegime) {
      shortScore += 20;
      shortReasons.push(
        `Strong trend (ADX ${adx.toFixed(1)})`,
      );
    }
  }

  // 15 — momentum
  if (
    bullishRegime &&
    roc > 0
  ) {
    longScore += 15;
    longReasons.push(
      `Positive momentum (${roc.toFixed(2)}%)`,
    );
  }

  if (
    bearishRegime &&
    roc < 0
  ) {
    shortScore += 15;
    shortReasons.push(
      `Negative momentum (${roc.toFixed(2)}%)`,
    );
  }

  // 15 — 20-candle breakout
  if (
    bullishRegime &&
    current.close > priorHigh
  ) {
    longScore += 15;
    longReasons.push(
      "20-candle bullish breakout",
    );
  }

  if (
    bearishRegime &&
    current.close < priorLow
  ) {
    shortScore += 15;
    shortReasons.push(
      "20-candle bearish breakout",
    );
  }

  // 10 — volume confirmation
  if (
    current.volume >=
    indicators.volumeMa20
  ) {
    if (
      bullishRegime &&
      current.close > current.open
    ) {
      longScore += 10;
      longReasons.push(
        "Volume confirms bullish move",
      );
    }

    if (
      bearishRegime &&
      current.close < current.open
    ) {
      shortScore += 10;
      shortReasons.push(
        "Volume confirms bearish move",
      );
    }
  }

  // 5 — RSI confirmation
  if (
    bullishRegime &&
    indicators.rsi14 >= 50 &&
    indicators.rsi14 <= 72
  ) {
    longScore += 5;
    longReasons.push(
      "RSI confirms bullish momentum",
    );
  }

  if (
    bearishRegime &&
    indicators.rsi14 <= 50 &&
    indicators.rsi14 >= 28
  ) {
    shortScore += 5;
    shortReasons.push(
      "RSI confirms bearish momentum",
    );
  }

  // 10 — avoid excessively extended entries
  if (atr > 0) {
    const extension =
      Math.abs(
        current.close -
          indicators.ema50,
      ) / atr;

    if (extension <= 3) {
      if (
        bullishRegime &&
        current.close > previous.close
      ) {
        longScore += 10;
        longReasons.push(
          "Price is not excessively extended",
        );
      }

      if (
        bearishRegime &&
        current.close < previous.close
      ) {
        shortScore += 10;
        shortReasons.push(
          "Price is not excessively extended",
        );
      }
    }
  }

  const score =
    Math.max(
      longScore,
      shortScore,
    );

  const threshold = Math.max(
    75,
    SAFE_TRADE_CONFIG.signalThreshold,
  );

  if (score < threshold) {
    return {
      symbol,
      signal: "WAIT",
      score,
      indicators,
      reasons: [
        "Regime momentum threshold not reached",
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
      score: longScore,
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
      score: shortScore,
      indicators,
      reasons: shortReasons,
      timestamp,
    };
  }

  return {
    symbol,
    signal: "WAIT",
    score,
    indicators,
    reasons: [
      "No directional advantage",
    ],
    timestamp,
  };
}
