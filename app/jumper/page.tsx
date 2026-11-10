import type { Metadata } from "next";
import JumperChecker from "@/components/jumper-checker";
import "./jumper.css";

export const metadata: Metadata = {
  title: "Jumper · Points Calculator",
  description: "Check your Jumper XP and compare hypothetical token allocations across FDV scenarios, eligibility cutoffs, and the Aspecta premarket.",
  icons: { icon: "/brand/jumper/symbol.svg" },
};

export default function JumperPage() {
  return <JumperChecker />;
}
