export const TXFLOW_FDV_PRESETS = [250_000_000, 500_000_000, 750_000_000, 1_000_000_000];
export const TXFLOW_ALLOCATION_PRESETS = [15, 20, 25];
export const TXFLOW_POOL_PRESETS = { basic: 45_600_000, bullish: 52_100_000 };
export type TxflowPoolMode = keyof typeof TXFLOW_POOL_PRESETS | "manual";
export type TxflowSettings = {
  pointsInput: string;
  totalInput: string;
  poolMode: TxflowPoolMode;
  fdv: number;
  allocation: number;
  perPoint: boolean;
};

export const TXFLOW_DEFAULTS: TxflowSettings = {
  pointsInput: "", totalInput: "", poolMode: "basic",
  fdv: TXFLOW_FDV_PRESETS[0], allocation: TXFLOW_ALLOCATION_PRESETS[0], perPoint: true,
};

export function parseTxflowSettings(raw: string | null): TxflowSettings {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return TXFLOW_DEFAULTS;
    const totalInput = typeof saved.totalInput === "string" && saved.totalInput.length <= 100 ? saved.totalInput : "";
    return {
      pointsInput: typeof saved.pointsInput === "string" && saved.pointsInput.length <= 100 ? saved.pointsInput : "",
      totalInput,
      // Keep earlier manual calculations when upgrading to selectable pool scenarios.
      poolMode: ["basic", "bullish", "manual"].includes(saved.poolMode) ? saved.poolMode : totalInput.trim() ? "manual" : "basic",
      fdv: Number.isFinite(saved.fdv) && saved.fdv >= 250_000_000 && saved.fdv <= 1_000_000_000 ? saved.fdv : TXFLOW_DEFAULTS.fdv,
      allocation: Number.isFinite(saved.allocation) && saved.allocation >= 15 && saved.allocation <= 25 ? saved.allocation : TXFLOW_DEFAULTS.allocation,
      perPoint: typeof saved.perPoint === "boolean" ? saved.perPoint : true,
    };
  } catch { return TXFLOW_DEFAULTS; }
}
