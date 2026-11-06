import type { Metadata } from "next";
import RisexCalculator from "@/components/risex-calculator";
import "./risex.css";

export const metadata: Metadata = {
  title: "RISEx · Points Calculator",
  description: "Estimate RISEx point value with adjustable FDV, airdrop allocation, and a projected 9–12 million points pool.",
  icons: { icon: "/brand/risex/symbol.svg" },
};

export default function RisexPage() {
  return <RisexCalculator />;
}
