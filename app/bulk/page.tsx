import type { Metadata } from "next";
import BulkCalculator from "@/components/bulk-calculator";
import "./bulk.css";

export const metadata: Metadata = {
  title: "BULK · AURA Calculator",
  description: "Estimate AURA value with manual FDV scenarios, a 30–70 million AURA pool and an assumed community allocation.",
  icons: { icon: "/brand/bulk/symbol.svg" },
};
export default function BulkPage() { return <BulkCalculator />; }
