export const VARIATIONAL_FDV_PRESETS = [100_000_000, 200_000_000, 300_000_000, 500_000_000, 800_000_000, 1_000_000_000, 2_000_000_000];
export const VARIATIONAL_ALLOCATION = 32;
export const VARIATIONAL_TOKEN_SOURCE = "https://docs.variational.io/token/usdvar";
export type VariationalSettings = { pointsInput: string; totalInput: string; fdvInput: string; supplyInput: string };
// The supply matches the user's reference grid. Neither it nor the pool is an official total.
export const VARIATIONAL_DEFAULTS: VariationalSettings = {
  pointsInput: "", totalInput: "10000000", fdvInput: "500000000", supplyInput: "1000000000",
};
export function parseVariationalSettings(raw: string | null): VariationalSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return VARIATIONAL_DEFAULTS;
    const field = (key: keyof VariationalSettings) => typeof value[key] === "string" && value[key].length <= 100 ? value[key] : VARIATIONAL_DEFAULTS[key];
    return { pointsInput: field("pointsInput"), totalInput: field("totalInput"), fdvInput: field("fdvInput"), supplyInput: field("supplyInput") };
  } catch { return VARIATIONAL_DEFAULTS; }
}
