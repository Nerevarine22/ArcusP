import PointsChecker from "@/components/points-checker";
import { getInfo, readLeaderboard } from "@/lib/leaderboard";
import { getTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialTheme = await getTheme();
  try {
    const snapshot = await readLeaderboard();
    return <PointsChecker info={getInfo(snapshot)} initialTheme={initialTheme} />;
  } catch (error) {
    console.error("Could not load leaderboard:", error);
    return <PointsChecker info={null} initialTheme={initialTheme} />;
  }
}
