import type { Metadata } from "next";
import EntropyWallet from "@/components/entropy-wallet";
import "./entropy.css";

export const metadata: Metadata = {
  title: "Entropy · Wallet Analytics",
  description: "Analyze io: markets or all Hyperliquid perpetual markets by wallet, including maker and taker volume, fees and funding from available API history.",
  icons: { icon: "/brand/entropy/symbol.svg" },
};
export default function EntropyPage() { return <EntropyWallet />; }
