export const EXTENDED_SUPPLY = 1_000_000_000;
export const EXTENDED_COMMUNITY_TOKENS = 300_000_000;
export const EXTENDED_ALLOCATION = EXTENDED_COMMUNITY_TOKENS / EXTENDED_SUPPLY * 100;
export const EXTENDED_FDV_PRESETS = [150_000_000, 300_000_000, 500_000_000, 800_000_000, 1_000_000_000];
export const EXTENDED_POINTS_SOURCE = "https://docs.extended.exchange/extended-resources/points-program";

export type ExtendedSettings = {
  pointsInput: string;
  totalInput: string;
  fdvInput: string;
};
export const EXTENDED_DEFAULTS: ExtendedSettings = {
  pointsInput: "", totalInput: "70000000", fdvInput: "500000000",
};

export function parseExtendedSettings(raw: string | null): ExtendedSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return EXTENDED_DEFAULTS;
    const field = (key: keyof ExtendedSettings) => typeof value[key] === "string" && value[key].length <= 100 ? value[key] : EXTENDED_DEFAULTS[key];
    return { pointsInput: field("pointsInput"), totalInput: field("totalInput"), fdvInput: field("fdvInput") };
  } catch { return EXTENDED_DEFAULTS; }
}
