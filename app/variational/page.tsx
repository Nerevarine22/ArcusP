import type { Metadata } from "next";
import VariationalCalculator from "@/components/variational-calculator";
import "./variational.css";

export const metadata: Metadata = {
  title: "Variational · Points Calculator",
  description: "Estimate Variational point value using Lighter premarket prices, FDV scenarios, and a manual points pool.",
  icons: { icon: "/brand/variational/symbol.svg" },
};

export default function VariationalPage() {
  return <VariationalCalculator />;
}
