import { readFile } from "node:fs/promises";
import path from "node:path";

export type Entry = {
  rank: number;
  name: string;
  tier: string;
  points: number | null;
};

export type Snapshot = {
  season: string;
  points_visible: boolean;
  total: number;
  updated_at: string;
  entries: Entry[];
  by_name: Record<string, number>;
};

export type LeaderboardInfo = Pick<Snapshot, "season" | "points_visible" | "total" | "updated_at"> & {
  snapshot_points: number | null;
};
export type PointsComparison = {
  status: "compared";
  previous_points: number;
  change_percent: number | null;
} | {
  status: "new";
  previous_points: null;
  change_percent: null;
};
export type SearchResult = LeaderboardInfo & { entry: Entry; comparison: PointsComparison | null };

export async function readLeaderboard(): Promise<Snapshot> {
  const contents = await readFile(path.join(process.cwd(), "leaderboard-season-1-2026-10-22.json"), "utf8");
  return JSON.parse(contents) as Snapshot;
}

export async function readPreviousLeaderboard(): Promise<Snapshot> {
  const contents = await readFile(path.join(process.cwd(), "leaderboard-season-1-2026-10-15.json"), "utf8");
  return JSON.parse(contents) as Snapshot;
}

export function getPointsComparison(previous: Snapshot, current: Entry): PointsComparison | null {
  if (!previous.points_visible || current.points === null || !Number.isFinite(current.points) || current.points < 0) return null;
  const key = current.name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!Object.hasOwn(previous.by_name, key)) return { status: "new", previous_points: null, change_percent: null };
  const previousPoints = previous.entries[previous.by_name[key]]?.points;
  if (previousPoints == null || !Number.isFinite(previousPoints) || previousPoints < 0) return null;
  // Compare integer hundredths to avoid rounding noise for equal point values.
  const before = Math.round(previousPoints * 100);
  const after = Math.round(current.points * 100);
  return {
    status: "compared",
    previous_points: previousPoints,
    change_percent: before > 0 ? (after - before) / before * 100 : after === 0 ? 0 : null,
  };
}

export function getInfo(snapshot: Snapshot): LeaderboardInfo {
  return {
    season: snapshot.season,
    points_visible: snapshot.points_visible,
    total: snapshot.total,
    updated_at: snapshot.updated_at,
    snapshot_points: snapshot.points_visible
      ? snapshot.entries.reduce((sum, entry) => sum + Math.round((entry.points ?? 0) * 100), 0) / 100
      : null,
  };
}
