import postgres from "postgres";
import { mergeResearchWallet, type ResearchStatus, type ResearchWallet } from "./research-data";

let client: ReturnType<typeof postgres> | null = null;
function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // Lazy creation permits builds before Neon is connected. One pool slot per serverless instance.
  client ??= postgres(url, { max: 1, prepare: false, ssl: "require", connect_timeout: 2, idle_timeout: 20,
    connection: { statement_timeout: 1500, lock_timeout: 1000 } });
  return client;
}

export async function saveResearchWallet(incoming: ResearchWallet): Promise<ResearchStatus> {
  try {
    const sql = database();
    if (!sql) return { status: "not_configured", message: "Research sharing is not connected yet. Your analysis is still available." };
    await sql.begin(async tx => {
      // The unique key plus row lock serializes concurrent writes for the same wallet.
      await tx`INSERT INTO analytics_research.wallets (project, address, document)
        VALUES (${incoming.project}, ${incoming.address}, ${tx.json(JSON.parse(JSON.stringify(incoming)))})
        ON CONFLICT (project, address) DO NOTHING`;
      const rows = await tx`SELECT document FROM analytics_research.wallets WHERE project = ${incoming.project} AND address = ${incoming.address} FOR UPDATE`;
      const merged = mergeResearchWallet(rows[0].document as ResearchWallet, incoming);
      await tx`UPDATE analytics_research.wallets SET document = ${tx.json(JSON.parse(JSON.stringify(merged)))}, updated_at = now()
        WHERE project = ${incoming.project} AND address = ${incoming.address}`;
    });
    return { status: "saved", message: "Research record saved. This wallet's existing record was updated without duplicates." };
  } catch {
    // Database errors can contain hostnames and credentials. Never return or log the driver error.
    console.warn("Research record could not be saved. Check the private database connection and migration.");
    return { status: "failed", message: "Research sharing could not be saved. Your analysis is still available; retry Analyze to share it." };
  }
}
