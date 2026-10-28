import type { Metadata } from "next";
import VariationalCalculator from "@/components/variational-calculator";
import "./variational.css";

export const metadata: Metadata = {
  title: "Variational · Points Calculator",
  description: "Estimate Variational point value using FDV scenarios, a manual points pool, and Polymarket probabilities.",
  icons: { icon: "/brand/variational/symbol.svg" },
};

export default function VariationalPage() {
  return <VariationalCalculator />;
}
