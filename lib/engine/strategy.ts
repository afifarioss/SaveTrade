import {
  calculateIndicators,
} from "./indicators";

import {
  SAFE_TRADE_CONFIG,
} from "../types/trading";

import type {
  Candle,
  SignalAnalysis,
  Symbol,
} from "../types/trading";

export function analyzeMarket(
  symbol: Symbol,
  candles: Candle[],
): SignalAnalysis {
  const timestamp =
    candles[candles.length - 1]?.timestamp ?? Date.now();

  if (candles.length < 200) {
    return {
      symbol,
      signal: "WAIT",
      score: 0,
      indicators: calculateIndicators(candles),
      reasons: ["Not enough candle history"],
      timestamp,
    };
  }

  const indicators = calculateIndicators(candles);
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  let longScore = 0;
  let shortScore = 0;

  const longReasons: string[] = [];
  const shortReasons: string[] = [];

  // Trend: 25 points
  if (
    current.close > indicators.ema200 &&
    indicators.ema50 > indicators.ema200
  ) {
    longScore += 25;
    longReasons.push("Bullish long-term trend");
  }

  if (
    current.close < indicators.ema200 &&
    indicators.ema50 < indicators.ema200
  ) {
    shortScore += 25;
    shortReasons.push("Bearish long-term trend");
  }

  // Pullback: 15 points
  const longPullback =
    current.low <= indicators.ema20 ||
    current.low <= indicators.ema50;

  const shortPullback =
    current.high >= indicators.ema20 ||
    current.high >= indicators.ema50;

  if (
    longPullback &&
    current.close > previous.close
  ) {
    longScore += 15;
    longReasons.push("Bullish pullback confirmation");
  }

  if (
    shortPullback &&
    current.close < previous.close
  ) {
    shortScore += 15;
    shortReasons.push("Bearish pullback confirmation");
  }

  // Momentum: 20 points
  if (
    indicators.rsi14 >= 45 &&
    indicators.rsi14 <= 70 &&
    current.close > previous.close
  ) {
    longScore += 20;
    longReasons.push("Bullish momentum");
  }

  if (
    indicators.rsi14 >= 30 &&
    indicators.rsi14 <= 55 &&
    current.close < previous.close
  ) {
    shortScore += 20;
    shortReasons.push("Bearish momentum");
  }

  // Volume: 15 points
  if (current.volume >= indicators.volumeMa20) {
    if (current.close > previous.close) {
      longScore += 15;
      longReasons.push("Volume confirms bullish move");
    }

    if (current.close < previous.close) {
      shortScore += 15;
      shortReasons.push("Volume confirms bearish move");
    }
  }

  // Price action: 10 points
  if (
    current.close > current.open &&
    current.close > previous.close
  ) {
    longScore += 10;
    longReasons.push("Bullish price action");
  }

  if (
    current.close < current.open &&
    current.close < previous.close
  ) {
    shortScore += 10;
    shortReasons.push("Bearish price action");
  }

  const score = Math.max(longScore, shortScore);

  if (score < SAFE_TRADE_CONFIG.signalThreshold) {
    return {
      symbol,
      signal: "WAIT",
      score,
      indicators,
      reasons: [
        "Signal threshold not reached",
        ...(
          longScore >= shortScore
            ? longReasons
            : shortReasons
        ),
      ],
      timestamp,
    };
  }

  if (longScore > shortScore) {
    return {
      symbol,
      signal: "BUY",
      score: longScore,
      indicators,
      reasons: longReasons,
      timestamp,
    };
  }

  if (shortScore > longScore) {
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
    reasons: ["No directional advantage"],
    timestamp,
  };
}
