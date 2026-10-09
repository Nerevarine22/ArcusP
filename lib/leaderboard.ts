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
export type SearchResult = LeaderboardInfo & { entry: Entry };

export async function readLeaderboard(): Promise<Snapshot> {
  const contents = await readFile(path.join(process.cwd(), "leaderboard-season-1.json"), "utf8");
  return JSON.parse(contents) as Snapshot;
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
