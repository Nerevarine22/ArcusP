export const FDV_PRESETS = [500_000_000, 1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000];
export const ALLOCATION_PRESETS = [5, 10, 15];
export const ASSUMED_TOTAL_POINTS = 11_000_000;

/** Proportional hypothetical allocation; round only when displaying. */
export function estimate(fdv: number, allocationPercent: number, totalPoints: number, points: number) {
  if (![fdv, allocationPercent, totalPoints, points].every(Number.isFinite)
    || fdv <= 0 || allocationPercent <= 0 || allocationPercent > 100
    || totalPoints <= 0 || points < 0 || points > totalPoints) return null;

  const poolValue = fdv * allocationPercent / 100;
  const valuePerPoint = poolValue / totalPoints;
  const poolShare = points / totalPoints * 100;
  return { poolValue, valuePerPoint, poolShare, value: points * valuePerPoint };
}

export function parsePoints(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
