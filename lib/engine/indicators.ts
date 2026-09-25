import type { Candle, Indicators } from "../types/trading";

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;

  const multiplier = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = (values[i] - result) * multiplier + result;
  }

  return result;
}

function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      (averageGain * (period - 1) + gain) / period;

    averageLoss =
      (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) return 100;

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length <= period) return 0;

  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];

    if (i === 0) {
      trueRanges.push(current.high - current.low);
      continue;
    }

    const previous = candles[i - 1];

    const range = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );

    trueRanges.push(range);
  }

  const recent = trueRanges.slice(-period);

  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

function volumeMovingAverage(
  candles: Candle[],
  period = 20,
): number {
  if (candles.length === 0) return 0;

  const recent = candles.slice(-period);

  return (
    recent.reduce((sum, candle) => sum + candle.volume, 0) /
    recent.length
  );
}

export function calculateIndicators(
  candles: Candle[],
): Indicators {
  if (candles.length === 0) {
    return {
      ema20: 0,
      ema50: 0,
      ema200: 0,
      rsi14: 50,
      atr14: 0,
      volumeMa20: 0,
    };
  }

  const closes = candles.map((candle) => candle.close);

  return {
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    atr14: atr(candles, 14),
    volumeMa20: volumeMovingAverage(candles, 20),
  };
}
