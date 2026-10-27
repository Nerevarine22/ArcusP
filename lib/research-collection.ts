import { readWeeklyPoints } from "./leaderboard";
import { arcusResearch, researchInput, txflowResearch, type ResearchStatus } from "./research-data";
import { saveResearchWallet } from "./research-store";
import type { WalletReport } from "./wallet-analytics";
import type { TxWalletReport } from "./txflow-wallet";
import { TXFLOW_EPOCHS } from "./txflow-wallet";

export async function collectArcusResearch(report: WalletReport, value: unknown): Promise<ResearchStatus> {
  const input = researchInput(value);
  try {
    // Read canonical point snapshots, never a browser-supplied leaderboard result.
    const points = input.name ? await readWeeklyPoints(input.name) : [];
    return await saveResearchWallet(arcusResearch(report, input.name, points));
  } catch {
    return { status: "failed", message: "Analysis could not be saved to the research dataset. Your results are still available." };
  }
}
export async function collectTxflowResearch(report: TxWalletReport, value: unknown): Promise<ResearchStatus> {
  const input = researchInput(value);
  try { return await saveResearchWallet(txflowResearch(report, input.points, input.totalPoints, TXFLOW_EPOCHS)); }
  catch { return { status: "failed", message: "Analysis could not be saved to the research dataset. Your results are still available." }; }
}
