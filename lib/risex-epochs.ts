const dayMs = 86_400_000;
export const risexWeekMs = 7 * dayMs;
const seasonStart = Date.parse("2026-07-20T00:00:00Z");

export type RisexUpcomingEpoch = { label: string; from: number; to: number; distribution: number };
export type RisexEpoch = {
  id: string;
  label: string;
  from: number | null;
  to: number;
  distribution: number;
  status: "upcoming" | "in-progress" | "awaiting-drop" | "completed";
};

export const risexRollingDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
export const risexScopes = {
  awarded: "Awarded epochs only", all: "All available history", season1: "Season 1",
  "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
};

export function risexScopeEpochs<T extends RisexEpoch>(epochs: T[], scope: string): T[] {
  if (scope === "all") return epochs;
  if (scope === "awarded" || scope === "season1") {
    return epochs.filter(epoch => epoch.status === "completed" && (scope === "awarded" || epoch.from !== null));
  }
  return epochs.filter(epoch => epoch.id === scope);
}

export function risexEpochs(now: number, upcoming: RisexUpcomingEpoch | null): RisexEpoch[] {
  const schedule: Omit<RisexEpoch, "status">[] = [{
    id: "preseason", label: "Pre-season · Retro", from: null, to: seasonStart,
    distribution: Date.parse("2026-07-23T14:00:00Z"),
  }];

  // Season 1 accrues Monday–Sunday UTC. The listed drops are the following Tuesday.
  for (let index = 0; index < 16; index++) {
    const from = seasonStart + index * risexWeekMs;
    const to = from + risexWeekMs;
    schedule.push({ id: `epoch:${from}`, label: `Week ${index + 1}`, from, to, distribution: to + dayMs + 14 * 3_600_000 });
  }
  if (upcoming) {
    const id = `epoch:${upcoming.from}`;
    const existing = schedule.findIndex(epoch => epoch.id === id);
    // RISEx timestamps the standard weekly close at Sunday 23:59 UTC.
    const weeklyEnd = upcoming.from + risexWeekMs;
    const to = upcoming.to === weeklyEnd - 60_000 ? weeklyEnd : upcoming.to;
    const live = { ...upcoming, id, to };
    if (existing < 0) schedule.push(live);
    else schedule[existing] = live;
  }

  return schedule.filter(epoch => epoch.from === null || epoch.from <= now || epoch.from === upcoming?.from).map(epoch => {
    const status = epoch.from !== null && now < epoch.from ? "upcoming"
      : now < epoch.to ? "in-progress" : now < epoch.distribution ? "awaiting-drop" : "completed";
    return { ...epoch, status };
  });
}
