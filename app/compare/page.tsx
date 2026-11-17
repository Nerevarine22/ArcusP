import type { Metadata } from "next";
import PairAnalytics from "@/components/pair-analytics";
import { getTheme } from "@/lib/theme";
import "./compare.css";

export const metadata: Metadata = {
  title: "Perp tools · Compare Wallets",
  description: "Compare two or more exchange wallets: combined net PnL, points, FDV scenarios, execution fees and funding.",
  icons: { icon: "/brand/perp-tools-symbol.svg" },
};
export default async function ComparePage() {
  return <PairAnalytics initialTheme={await getTheme()} />;
}
