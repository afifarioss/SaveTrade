export type Symbol = "BTC/USDT" | "ETH/USDT";

export type Side = "LONG" | "SHORT";

export type Signal = "BUY" | "SELL" | "WAIT";

export type BotMode = "PAPER";

export type BotStatus =
  | "READY"
  | "ANALYZING"
  | "WAITING"
  | "IN_POSITION"
  | "SAFE_MODE"
  | "STOPPED";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  atr14: number;
  volumeMa20: number;
}

export interface SignalAnalysis {
  symbol: Symbol;
  signal: Signal;
  score: number;
  indicators: Indicators;
  reasons: string[];
  timestamp: number;
}

export interface RiskSettings {
  riskPerTrade: number;
  reducedRiskPerTrade: number;
  dailyLossLimit: number;
  weeklyLossLimit: number;
  maxConcurrentRisk: number;
  maxPositions: number;
  maxNotionalPercent: number;
}

export interface Position {
  id: string;
  symbol: Symbol;
  side: Side;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  riskAmount: number;
  openedAt: number;
  strategyVersion: string;
}

export interface Trade {
  id: string;
  symbol: Symbol;
  side: Side;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  riskAmount: number;
  pnl: number;
  rMultiple: number;
  openedAt: number;
  closedAt: number;
  exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "MANUAL";
  strategyVersion: string;
  signalScore: number;
}

export interface AccountState {
  startingBalance: number;
  balance: number;
  equity: number;
  dailyPnl: number;
  weeklyPnl: number;
  consecutiveLosses: number;
  consecutiveLosingDays: number;
  positions: Position[];
  trades: Trade[];
  botStatus: BotStatus;
  mode: BotMode;
}

export const SAFE_TRADE_CONFIG = {
  startingBalance: 100,
  dailyTarget: 30,
  normalRisk: 0.005,
  reducedRisk: 0.0025,
  dailyLossLimit: 0.02,
  weeklyLossLimit: 0.05,
  maxConcurrentRisk: 0.02,
  maxPositions: 2,
  maxNotionalPercent: 0.20,
  atrStopMultiplier: 1.5,
  takeProfitR: 2,
  signalThreshold: 70,
  strategyVersion: "ST-TREND-PULLBACK-1.0",
} as const;
