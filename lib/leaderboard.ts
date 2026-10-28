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
export type PointWeek = {
  week: number;
  distributed_at: string;
  downloaded_at: string | null;
  cumulative_points: number | null;
  earned_points: number | null;
  status: "recorded" | "missing" | "hidden" | "unavailable" | "baseline_missing" | "adjusted";
};
export type SearchResult = LeaderboardInfo & { entry: Entry; comparison: PointsComparison | null; weekly_points?: PointWeek[] };

// Distribution dates identify the week represented by each download; download
// timestamps alone cannot identify a reward period.
const snapshots = [
  { week: 1, distributed_at: "2026-10-07T19:00:00Z", file: "leaderboard-season-1.json" },
  { week: 2, distributed_at: "2026-10-14T19:00:00Z", file: "leaderboard-season-1-2026-10-15.json" },
  { week: 3, distributed_at: "2026-10-21T19:00:00Z", file: "leaderboard-season-1-2026-10-22.json" },
  { week: 4, distributed_at: "2026-10-28T19:00:00Z", file: "leaderboard-season-1-2026-10-28.json" },
];

export async function readLeaderboard(): Promise<Snapshot> {
  const contents = await readFile(path.join(process.cwd(), snapshots[snapshots.length - 1].file), "utf8");
  return JSON.parse(contents) as Snapshot;
}

export async function readPreviousLeaderboard(): Promise<Snapshot> {
  const contents = await readFile(path.join(process.cwd(), snapshots[snapshots.length - 2].file), "utf8");
  return JSON.parse(contents) as Snapshot;
}

export function getWeeklyPoints(history: { week: number; distributed_at: string; snapshot: Snapshot | null }[], name: string): PointWeek[] {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  const result: PointWeek[] = [];
  for (const item of [...history].sort((a, b) => a.week - b.week)) {
    const snapshot = item.snapshot;
    const entry = snapshot && Object.hasOwn(snapshot.by_name, key) ? snapshot.entries[snapshot.by_name[key]] : null;
    const points = snapshot?.points_visible && entry?.points != null && Number.isFinite(entry.points) && entry.points >= 0 ? entry.points : null;
    const previous = result.find(row => row.week === item.week - 1);
    const baseline = item.week === 1 ? 0 : previous?.cumulative_points ?? null;
    const earned = points !== null && baseline !== null ? (Math.round(points * 100) - Math.round(baseline * 100)) / 100 : null;
    result.push({ week: item.week, distributed_at: item.distributed_at, downloaded_at: snapshot?.updated_at ?? null,
      cumulative_points: points, earned_points: earned,
      status: !snapshot ? "unavailable" : !snapshot.points_visible ? "hidden" : !entry ? "missing" : points === null ? "hidden" : baseline === null ? "baseline_missing" : earned! < 0 ? "adjusted" : "recorded" });
  }
  return result;
}

export async function readWeeklyPoints(name: string): Promise<PointWeek[]> {
  const history = await Promise.all(snapshots.map(async item => {
    try { return { ...item, snapshot: JSON.parse(await readFile(path.join(process.cwd(), item.file), "utf8")) as Snapshot }; }
    catch { return { ...item, snapshot: null }; }
  }));
  return getWeeklyPoints(history, name);
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
