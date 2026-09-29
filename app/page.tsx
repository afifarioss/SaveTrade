"use client";

import { useEffect, useState } from "react";

type MarketAnalysis = {
  symbol: string;
  signal: "BUY" | "SELL" | "WAIT";
  score: number;
  reasons: string[];
};

type Account = {
  mode: string;
  status: string;
  balance: number;
  equity: number;
  dailyPnl: number;
  weeklyPnl: number;
  dailyTarget: number;
  dailyTargetProgress: number;
  openPositions: number;
  completedTrades: number;
  consecutiveLosses: number;
};

export default function Home() {
  const [account, setAccount] = useState<Account | null>(null);
  const [markets, setMarkets] = useState<MarketAnalysis[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadDashboard() {
    setLoading(true);

    try {
      const accountResponse =
        await fetch("/api/account", {
          cache: "no-store",
        });

      const accountData =
        await accountResponse.json();

      if (accountData.ok) {
        setAccount(accountData.account);
      }

      const symbols = [
        "BTC/USDT",
        "ETH/USDT",
      ];

      const results =
        await Promise.all(
          symbols.map(async (symbol) => {
            const response = await fetch(
              `/api/market?symbol=${encodeURIComponent(symbol)}`,
              { cache: "no-store" },
            );

            const data =
              await response.json();

            if (!data.ok) {
              return {
                symbol,
                signal: "WAIT" as const,
                score: 0,
                reasons: [
                  "Market data unavailable",
                ],
              };
            }

            return data.analysis;
          }),
        );

      setMarkets(results);
    } catch {
      setMarkets(
        ["BTC/USDT", "ETH/USDT"].map(
          (symbol) => ({
            symbol,
            signal: "WAIT" as const,
            score: 0,
            reasons: [
              "Unable to connect to SafeTrade",
            ],
          }),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="brand">
            SAFETRADE
          </div>
          <div className="subtitle">
            Personal trading assistant
          </div>
        </div>

        <span className="paper-badge">
          ● PAPER
        </span>
      </header>

      <section className="balance-card">
        <span className="label">
          Paper Balance
        </span>

        <strong>
          $
          {account?.balance.toFixed(2) ??
            "100.00"}
        </strong>

        <div className="target-row">
          <span>
            Today
          </span>

          <span>
            $
            {account?.dailyPnl.toFixed(2) ??
              "0.00"}
          </span>
        </div>

        <div className="target-row">
          <span>
            Daily target
          </span>

          <span>
            $
            {account?.dailyTarget.toFixed(2) ??
              "30.00"}
          </span>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Markets</h2>

          <button
            onClick={loadDashboard}
            disabled={loading}
          >
            {loading
              ? "Updating..."
              : "Refresh"}
          </button>
        </div>

        <div className="market-list">
          {markets.map((market) => (
            <article
              className="market-card"
              key={market.symbol}
            >
              <div>
                <strong>
                  {market.symbol}
                </strong>

                <div className="score">
                  Score {market.score}/100
                </div>
              </div>

              <div
                className={`signal ${market.signal.toLowerCase()}`}
              >
                {market.signal}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="risk-card">
        <div>
          <span className="label">
            Risk Status
          </span>

          <strong>
            {account?.status ===
            "SAFE_MODE"
              ? "SAFE MODE"
              : "SAFE"}
          </strong>
        </div>

        <div className="risk-details">
          <span>
            Open positions{" "}
            {account?.openPositions ?? 0}
          </span>

          <span>
            Loss streak{" "}
            {account?.consecutiveLosses ?? 0}
          </span>
        </div>
      </section>

      <button
        className="analyze-button"
        onClick={loadDashboard}
        disabled={loading}
      >
        {loading
          ? "ANALYZING..."
          : "ANALYZE MARKET"}
      </button>

      <section className="creator">
        <strong>SafeTrade</strong>
        <span>
          Built by Afif
        </span>
        <small>
          A personal experiment in AI-assisted,
          risk-controlled trading.
        </small>
      </section>

      <nav className="bottom-nav">
        <span className="active">
          Home
        </span>
        <span>Markets</span>
        <span>Trades</span>
        <span>Backtest</span>
      </nav>
    </main>
  );
}
