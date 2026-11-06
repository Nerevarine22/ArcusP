import type { Metadata } from "next";
import RisexWallet from "@/components/risex-wallet";
import "../risex.css";
import "./wallet.css";

export const metadata: Metadata = {
  title: "RISEx · Wallet Analytics",
  description: "Analyze public RISEx trades, fees, holding times, settled funding and positions by wallet address.",
  icons: { icon: "/brand/risex/symbol.svg" },
};

export default function RisexWalletPage() {
  return <RisexWallet />;
}
