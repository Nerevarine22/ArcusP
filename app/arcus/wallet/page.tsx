import type { Metadata } from "next";
import WalletAnalytics from "@/components/wallet-analytics";
import { getTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Arcus · Wallet Analytics",
  description: "Explore Arcus trading volume, fees, and weekly points comparisons.",
  icons: { icon: "/brand/arcus-symbol.svg" },
};

export default async function ArcusWalletPage() {
  return <WalletAnalytics initialTheme={await getTheme()} />;
}
