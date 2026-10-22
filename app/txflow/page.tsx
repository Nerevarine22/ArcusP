import type { Metadata } from "next";
import TxflowCalculator from "@/components/txflow-calculator";
import { getTheme } from "@/lib/theme";
import "./txflow.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TxFlow · Points Estimator",
  description: "Explore TxFlow points value with your own points pool, FDV, and airdrop allocation assumptions.",
  icons: { icon: "/brand/txflow/favicon.ico" },
};

export default async function TxflowPage() {
  return <TxflowCalculator initialTheme={await getTheme()} />;
}
