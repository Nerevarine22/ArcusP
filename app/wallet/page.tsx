import type { Metadata } from "next";
import WalletAnalytics from "@/components/wallet-analytics";
import { getTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Arcus · Wallet Analytics", description: "Explore Arcus trading volume, fees, fills, and cost per point." };

export default async function WalletPage() {
  return <WalletAnalytics initialTheme={await getTheme()} />;
}
