export const TXFLOW_LEADERBOARD_PERIODS = {
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
  alltime: "All time",
} as const;

export const TXFLOW_LEADERBOARD_METRICS = {
  pnl: "PnL",
  roi: "ROI",
  volume: "Trading volume",
} as const;

export type TxflowLeaderboardPeriod = keyof typeof TXFLOW_LEADERBOARD_PERIODS;
export type TxflowLeaderboardMetric = keyof typeof TXFLOW_LEADERBOARD_METRICS;
export type TxflowLeaderboardResult = {
  ranks: Record<TxflowLeaderboardMetric, number | null | "unavailable">;
  updatedAt: number | null;
};
