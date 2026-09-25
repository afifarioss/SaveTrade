import {
  SAFE_TRADE_CONFIG,
} from "../types/trading";

import type {
  AccountState,
  Position,
  RiskSettings,
  Side,
} from "../types/trading";

export interface RiskDecision {
  allowed: boolean;
  reason: string;
  riskAmount: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  notional: number;
}

const DEFAULT_RISK: RiskSettings = {
  riskPerTrade: SAFE_TRADE_CONFIG.normalRisk,
  reducedRiskPerTrade: SAFE_TRADE_CONFIG.reducedRisk,
  dailyLossLimit: SAFE_TRADE_CONFIG.dailyLossLimit,
  weeklyLossLimit: SAFE_TRADE_CONFIG.weeklyLossLimit,
  maxConcurrentRisk: SAFE_TRADE_CONFIG.maxConcurrentRisk,
  maxPositions: SAFE_TRADE_CONFIG.maxPositions,
  maxNotionalPercent: SAFE_TRADE_CONFIG.maxNotionalPercent,
};

function isDailyLimitReached(
  account: AccountState,
): boolean {
  return (
    account.dailyPnl <=
    -(account.balance * DEFAULT_RISK.dailyLossLimit)
  );
}

function isWeeklyLimitReached(
  account: AccountState,
): boolean {
  return (
    account.weeklyPnl <=
    -(account.balance * DEFAULT_RISK.weeklyLossLimit)
  );
}

function currentOpenRisk(
  positions: Position[],
): number {
  return positions.reduce(
    (total, position) => total + position.riskAmount,
    0,
  );
}

export function calculateRiskDecision(
  account: AccountState,
  side: Side,
  entryPrice: number,
  atr: number,
): RiskDecision {
  const emptyDecision: RiskDecision = {
    allowed: false,
    reason: "",
    riskAmount: 0,
    quantity: 0,
    stopLoss: 0,
    takeProfit: 0,
    notional: 0,
  };

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return {
      ...emptyDecision,
      reason: "Invalid entry price",
    };
  }

  if (!Number.isFinite(atr) || atr <= 0) {
    return {
      ...emptyDecision,
      reason: "Invalid ATR",
    };
  }

  if (account.mode !== "PAPER") {
    return {
      ...emptyDecision,
      reason: "Live trading is disabled",
    };
  }

  if (account.botStatus === "SAFE_MODE") {
    return {
      ...emptyDecision,
      reason: "Bot is in safe mode",
    };
  }

  if (account.botStatus === "STOPPED") {
    return {
      ...emptyDecision,
      reason: "Bot is stopped",
    };
  }

  if (account.positions.length >= DEFAULT_RISK.maxPositions) {
    return {
      ...emptyDecision,
      reason: "Maximum open positions reached",
    };
  }

  if (isDailyLimitReached(account)) {
    return {
      ...emptyDecision,
      reason: "Daily loss limit reached",
    };
  }

  if (isWeeklyLimitReached(account)) {
    return {
      ...emptyDecision,
      reason: "Weekly loss limit reached",
    };
  }

  const normalRisk =
    account.consecutiveLosses >= 2
      ? DEFAULT_RISK.reducedRiskPerTrade
      : DEFAULT_RISK.riskPerTrade;

  const riskAmount = account.balance * normalRisk;

  const stopDistance =
    atr * SAFE_TRADE_CONFIG.atrStopMultiplier;

  if (stopDistance <= 0) {
    return {
      ...emptyDecision,
      reason: "Invalid stop distance",
    };
  }

  const openRisk = currentOpenRisk(account.positions);

  const maximumOpenRisk =
    account.balance * DEFAULT_RISK.maxConcurrentRisk;

  if (
    openRisk + riskAmount >
    maximumOpenRisk
  ) {
    return {
      ...emptyDecision,
      reason: "Maximum concurrent risk reached",
    };
  }

  let stopLoss: number;
  let takeProfit: number;

  if (side === "LONG") {
    stopLoss = entryPrice - stopDistance;
    takeProfit =
      entryPrice +
      stopDistance * SAFE_TRADE_CONFIG.takeProfitR;
  } else {
    stopLoss = entryPrice + stopDistance;
    takeProfit =
      entryPrice -
      stopDistance * SAFE_TRADE_CONFIG.takeProfitR;
  }

  if (stopLoss <= 0 || takeProfit <= 0) {
    return {
      ...emptyDecision,
      reason: "Invalid stop or target",
    };
  }

  let quantity =
    riskAmount / stopDistance;

  const maximumNotional =
    account.balance *
    DEFAULT_RISK.maxNotionalPercent;

  const maximumQuantity =
    maximumNotional / entryPrice;

  quantity = Math.min(
    quantity,
    maximumQuantity,
  );

  const notional =
    quantity * entryPrice;

  if (quantity <= 0 || notional <= 0) {
    return {
      ...emptyDecision,
      reason: "Position size is zero",
    };
  }

  return {
    allowed: true,
    reason: "Risk checks passed",
    riskAmount: quantity * stopDistance,
    quantity,
    stopLoss,
    takeProfit,
    notional,
  };
}
