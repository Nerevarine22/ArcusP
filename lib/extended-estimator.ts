export const EXTENDED_SUPPLY = 1_000_000_000;
export const EXTENDED_COMMUNITY_TOKENS = 300_000_000;
export const EXTENDED_TOTAL_POINTS = 70_000_000;
export const EXTENDED_TOKENS_PER_POINT = EXTENDED_COMMUNITY_TOKENS / EXTENDED_TOTAL_POINTS;
export const EXTENDED_ALLOCATION = EXTENDED_COMMUNITY_TOKENS / EXTENDED_SUPPLY * 100;
export const EXTENDED_FDV_PRESETS = [150_000_000, 250_000_000, 300_000_000, 500_000_000, 800_000_000, 1_000_000_000];
export const EXTENDED_POINTS_SOURCE = "https://t.me/extended_updates/395";

export function extendedTokensForPoints(points: number | null) {
  if (points === null || !Number.isFinite(points) || points < 0 || points > EXTENDED_TOTAL_POINTS) return null;
  return points * EXTENDED_TOKENS_PER_POINT;
}

export function estimateExtended(fdv: number, tokens: number | null) {
  if (!Number.isFinite(fdv) || fdv <= 0) return null;
  const tokenPrice = fdv / EXTENDED_SUPPLY;
  return { tokenPrice, valuePerPoint: EXTENDED_TOKENS_PER_POINT * tokenPrice, value: tokens === null ? undefined : tokens * tokenPrice };
}

export type ExtendedSettings = {
  pointsInput: string;
  fdvInput: string;
};
export const EXTENDED_DEFAULTS: ExtendedSettings = {
  pointsInput: "", fdvInput: "500000000",
};

export function parseExtendedSettings(raw: string | null): ExtendedSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return EXTENDED_DEFAULTS;
    const field = (key: keyof ExtendedSettings) => typeof value[key] === "string" && value[key].length <= 100 ? value[key] : EXTENDED_DEFAULTS[key];
    return { pointsInput: field("pointsInput"), fdvInput: field("fdvInput") };
  } catch { return EXTENDED_DEFAULTS; }
}
