import type { Metadata } from "next";
import EntropyWallet from "@/components/entropy-wallet";
import "./entropy.css";

export const metadata: Metadata = {
  title: "Entropy · Wallet Analytics",
  description: "Analyze Entropy io: trading volume, maker and taker fees, funding, and holding times using public Hyperliquid data.",
  icons: { icon: "/brand/entropy/symbol.svg" },
};
export default function EntropyPage() { return <EntropyWallet />; }
