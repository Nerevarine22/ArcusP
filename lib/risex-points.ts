export function isRisexWallet(address: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(address);
}

type HistoryEntry = {
  epoch?: { epoch_id?: unknown };
  ledger?: { total_points?: unknown };
};

export function readRisexHistory(payload: unknown): { points: number; epochs: number } | null {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) return null;

  const epochIds = new Set<string>();
  let points = 0;
  for (const entry of payload.data as (HistoryEntry | null)[]) {
    const epochId = entry?.epoch?.epoch_id;
    const rawPoints = entry?.ledger?.total_points;
    if (typeof epochId !== "string" || !epochId || epochIds.has(epochId)) return null;
    const epochPoints = typeof rawPoints === "string" && /^\d+(?:\.\d+)?$/.test(rawPoints)
      ? Number(rawPoints)
      : rawPoints;
    if (typeof epochPoints !== "number" || !Number.isFinite(epochPoints) || epochPoints < 0) return null;
    epochIds.add(epochId);
    points += epochPoints;
  }

  return points <= 1e15 ? { points, epochs: epochIds.size } : null;
}
