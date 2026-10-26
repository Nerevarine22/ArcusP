import type { Metadata } from "next";
import ExtendedCalculator from "@/components/extended-calculator";
import "./extended.css";

export const metadata: Metadata = {
  title: "Extended · Xpoints Calculator",
  description: "Explore the implied value of your Extended Xpoints with XTEN supply, community allocation, and FDV scenarios.",
  icons: { icon: "/brand/extended/symbol.svg" },
};

export default function ExtendedPage() {
  return <ExtendedCalculator />;
}
