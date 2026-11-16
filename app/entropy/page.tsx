import type { Metadata } from "next";
import EntropyWallet from "@/components/entropy-wallet";
import "./entropy.css";

export const metadata: Metadata = {
  title: "Entropy · Wallet Analytics",
  description: "Analyze confirmed Entropy builder trades, maker and taker volume, and verified execution fees, with public archive coverage shown.",
  icons: { icon: "/brand/entropy/symbol.svg" },
};
export default function EntropyPage() { return <EntropyWallet />; }
