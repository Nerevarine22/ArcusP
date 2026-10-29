export const BULK_FDV_PRESETS = [100_000_000, 200_000_000, 300_000_000, 500_000_000, 750_000_000, 1_000_000_000];
export const BULK_POOL_PRESETS = [30_000_000, 50_000_000, 70_000_000];
export type BulkSettings = { pointsInput: string; totalInput: string; fdvInput: string; allocationInput: string; matrixMode: "unit" | "personal" };
// Community scenarios supplied for this calculator, not official campaign totals.
export const BULK_DEFAULTS: BulkSettings = { pointsInput: "", totalInput: "50000000", fdvInput: "300000000", allocationInput: "30", matrixMode: "unit" };
export function parseBulkSettings(raw: string | null): BulkSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return BULK_DEFAULTS;
    const field = (key: Exclude<keyof BulkSettings, "matrixMode">) => typeof value[key] === "string" && value[key].length <= 100 ? value[key] : BULK_DEFAULTS[key];
    return { pointsInput: field("pointsInput"), totalInput: field("totalInput"), fdvInput: field("fdvInput"), allocationInput: field("allocationInput"), matrixMode: value.matrixMode === "personal" ? "personal" : "unit" };
  } catch { return BULK_DEFAULTS; }
}
