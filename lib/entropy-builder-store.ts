import postgres from "postgres";
import { mergeBuilderDay, type BuilderDay, type EntropyBuilderReport } from "./entropy-builder";

let client: ReturnType<typeof postgres> | null = null;
function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("Entropy history storage is not configured. Set DATABASE_URL and run npm run entropy:init.");
  return client ??= postgres(url, { max: 1, prepare: false, ssl: "require", connect_timeout: 5, idle_timeout: 20,
    connection: { statement_timeout: 8000, lock_timeout: 2000 } });
}
export async function readBuilderDays(address: string, dates: string[]): Promise<BuilderDay[]> {
  if (!dates.length) return [];
  try {
    const sql = database();
    const rows = await sql`SELECT document FROM entropy_analytics.wallet_days WHERE address = ${address} AND day >= ${dates[0]}::date AND day <= ${dates.at(-1)!}::date ORDER BY day`;
    return rows.map(row => row.document as BuilderDay);
  } catch {
    throw new Error("Entropy history storage is unavailable. Check the database connection and run npm run entropy:init.");
  }
}
export async function saveBuilderDays(address: string, days: BuilderDay[]): Promise<void> {
  if (!days.length) return;
  try {
    const sql = database();
    await sql.begin(async tx => {
      const incoming = tx.json(JSON.parse(JSON.stringify(days)));
      await tx`INSERT INTO entropy_analytics.wallet_days (address, day, document)
        SELECT ${address}, (value->>'day')::date, value FROM jsonb_array_elements(${incoming})
        ORDER BY value->>'day' ON CONFLICT (address, day) DO NOTHING`;
      const locked = await tx`SELECT document FROM entropy_analytics.wallet_days WHERE address = ${address}
        AND day IN (SELECT (value->>'day')::date FROM jsonb_array_elements(${incoming})) ORDER BY day FOR UPDATE`;
      const current = new Map(locked.map(row => { const day = row.document as BuilderDay; return [day.day, day]; }));
      const merged = days.map(day => {
        const previous = current.get(day.day);
        return previous && Date.parse(previous.checkedAt) > Date.parse(day.checkedAt) ? previous : mergeBuilderDay(previous, day);
      });
      await tx`UPDATE entropy_analytics.wallet_days AS saved SET document = source.value, updated_at = now()
        FROM jsonb_array_elements(${tx.json(JSON.parse(JSON.stringify(merged)))}) AS source(value)
        WHERE saved.address = ${address} AND saved.day = (source.value->>'day')::date`;
    });
  } catch { throw new Error("Entropy executions could not be saved. Previously saved history is retained; retry shortly."); }
}
export async function saveBuilderReport(report: EntropyBuilderReport): Promise<void> {
  try {
    const sql = database();
    await sql`INSERT INTO entropy_analytics.wallet_reports (address, period, document) VALUES (${report.address}, ${report.period}, ${sql.json(JSON.parse(JSON.stringify(report)))})
      ON CONFLICT (address, period) DO UPDATE SET document = EXCLUDED.document, updated_at = now()
      WHERE (entropy_analytics.wallet_reports.document->>'fetchedAt')::timestamptz <= (EXCLUDED.document->>'fetchedAt')::timestamptz`;
  } catch { throw new Error("Entropy analysis could not be saved. Previously saved executions are retained."); }
}
