export const JUMPER_FDV_PRESETS = [75_000_000, 150_000_000, 250_000_000, 500_000_000];
export const JUMPER_ALLOCATION_PRESETS = [5, 10, 20, 33.33];
export const JUMPER_ASSUMED_SUPPLY = 1_000_000_000;
export type JumperEstimateSettings = {
  pointsInput: string | null;
  totalInput: string;
  fdvInput: string;
  allocationInput: string;
  minimumXp: number;
};
export const JUMPER_ESTIMATE_DEFAULTS: JumperEstimateSettings = {
  pointsInput: null, totalInput: "250000000", fdvInput: "75000000", allocationInput: "10", minimumXp: 0,
};

export function parseJumperEstimateSettings(raw: string | null): JumperEstimateSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return JUMPER_ESTIMATE_DEFAULTS;
    const field = (key: "totalInput" | "fdvInput" | "allocationInput") => typeof value[key] === "string" && value[key].length <= 100 ? value[key] : JUMPER_ESTIMATE_DEFAULTS[key];
    return {
      pointsInput: typeof value.pointsInput === "string" && value.pointsInput.length <= 100 ? value.pointsInput : null,
      totalInput: field("totalInput"), fdvInput: field("fdvInput"), allocationInput: field("allocationInput"),
      minimumXp: Number.isSafeInteger(value.minimumXp) && value.minimumXp >= 0 && value.minimumXp <= 1_000_000 ? value.minimumXp : 0,
    };
  } catch { return JUMPER_ESTIMATE_DEFAULTS; }
}

/** Scale the assumed total XP by the observed share above an inclusive cutoff. */
export function jumperEligibility(histogram: readonly (readonly number[])[], minimumXp: number) {
  let totalXp = 0, totalWallets = 0, eligibleXp = 0, wallets = 0;
  for (const [xp, count] of histogram) {
    totalXp += xp * count;
    totalWallets += count;
    if (xp >= minimumXp) { eligibleXp += xp * count; wallets += count; }
  }
  return { wallets, walletShare: totalWallets > 0 ? wallets / totalWallets : 0, xpShare: totalXp > 0 ? eligibleXp / totalXp : 0 };
}
