import type { Metadata } from "next";
import TxflowWallet from "@/components/txflow-wallet";
import { getTheme } from "@/lib/theme";
import "../txflow.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TxFlow · Wallet Analytics",
  description: "Analyze public TxFlow perpetual trading volume, fill fees, funding and positions by wallet address.",
  icons: { icon: "/brand/txflow/favicon.ico" },
};
export default async function TxflowWalletPage() {
  return <TxflowWallet initialTheme={await getTheme()} />;
}
