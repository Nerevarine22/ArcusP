import { builderDayFresh, builderProgress, buildBuilderReport, entropyArchiveDays, mergeBuilderDay, reconcileBuilderExecutions, type BuilderDay, type EntropyBuilderReport } from "./entropy-builder";
import type { EntropyFill, EntropyPeriod } from "./entropy-wallet";

export type BuilderDependencies = {
  read: (address: string, dates: string[]) => Promise<BuilderDay[]>;
  save: (address: string, days: BuilderDay[]) => Promise<void>;
  saveReport: (report: EntropyBuilderReport) => Promise<void>;
  archive: (day: string, address: string, now: number, signal: AbortSignal) => Promise<BuilderDay>;
  fees: (address: string, signal: AbortSignal) => Promise<EntropyFill[]>;
};
export async function syncBuilderWallet(address: string, period: EntropyPeriod, now: number, sync: boolean, signal: AbortSignal, dependencies: BuilderDependencies, batchSize = 12): Promise<EntropyBuilderReport> {
  const dates = entropyArchiveDays(period, now), saved = await dependencies.read(address, dates);
  const byDay = new Map(saved.map(day => [day.day, day]));
  const pending = dates.filter(day => !builderDayFresh(byDay.get(day), now));
  if (!sync || !pending.length) return buildBuilderReport(address, period, now, saved, builderProgress(dates, saved, now, true));
  const selected = pending.slice(0, batchSize), results: BuilderDay[] = [];
  const feeHistory = dependencies.fees(address, signal).catch(() => [] as EntropyFill[]);
  let next = 0;
  // Bounded work per request permits resumable imports on serverless hosting.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < selected.length && !signal.aborted) {
      const day = selected[next++];
      const incoming = await dependencies.archive(day, address, now, signal);
      results.push(mergeBuilderDay(byDay.get(day), incoming));
    }
  }));
  const history = await feeHistory;
  for (const day of results) day.fills = reconcileBuilderExecutions(day.fills, history);
  if (results.length) await dependencies.save(address, results);
  // Re-read after the atomic upsert to include newer concurrent imports without losing their progress.
  const latest = await dependencies.read(address, dates);
  const report = buildBuilderReport(address, period, now, latest, builderProgress(dates, latest, now, false));
  await dependencies.saveReport(report);
  return report;
}
