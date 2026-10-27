import { readWeeklyPoints } from "./leaderboard";
import { arcusResearch, researchInput, txflowResearch, type ResearchStatus } from "./research-data";
import { saveResearchWallet } from "./research-store";
import type { WalletReport } from "./wallet-analytics";
import type { TxWalletReport } from "./txflow-wallet";
import { TXFLOW_EPOCHS } from "./txflow-wallet";

export async function collectArcusResearch(report: WalletReport, value: unknown): Promise<ResearchStatus | undefined> {
  const input = researchInput(value);
  if (!input) return undefined;
  try {
    // Read canonical point snapshots, never a browser-supplied leaderboard result.
    const points = input.name ? await readWeeklyPoints(input.name) : [];
    return await saveResearchWallet(arcusResearch(report, input.name, points));
  } catch {
    return { status: "failed", message: "Research sharing could not be saved. Your analysis is still available." };
  }
}
export async function collectTxflowResearch(report: TxWalletReport, value: unknown): Promise<ResearchStatus | undefined> {
  const input = researchInput(value);
  if (!input) return undefined;
  try { return await saveResearchWallet(txflowResearch(report, input.points, input.totalPoints, TXFLOW_EPOCHS)); }
  catch { return { status: "failed", message: "Research sharing could not be saved. Your analysis is still available." }; }
}
