import type { Metadata } from "next";
import PointsChecker from "@/components/points-checker";
import { getInfo, readLeaderboard } from "@/lib/leaderboard";
import { getTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Arcus · Points Estimator",
  description: "Find your Arcus points and compare FDV and airdrop allocation scenarios.",
  icons: { icon: "/brand/arcus-symbol.svg" },
};

export default async function ArcusPage() {
  const initialTheme = await getTheme();
  try {
    return <PointsChecker info={getInfo(await readLeaderboard())} initialTheme={initialTheme} />;
  } catch (error) {
    console.error("Could not load leaderboard:", error);
    return <PointsChecker info={null} initialTheme={initialTheme} />;
  }
}
