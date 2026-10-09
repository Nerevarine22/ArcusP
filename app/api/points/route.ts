import { NextRequest, NextResponse } from "next/server";
import { getInfo, readLeaderboard } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim().replace(/\s+/g, " ") ?? "";
  const headers = { "Cache-Control": "no-store" };

  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Enter a nickname between 1 and 100 characters." }, { status: 400, headers });
  }

  try {
    const snapshot = await readLeaderboard();
    const key = name.toLowerCase();
    if (!Object.hasOwn(snapshot.by_name, key)) {
      return NextResponse.json({ error: "This nickname is not in the leaderboard snapshot. Check the spelling and try again." }, { status: 404, headers });
    }
    const entry = snapshot.entries[snapshot.by_name[key]];
    return NextResponse.json({
      ...getInfo(snapshot),
      entry: { ...entry, points: snapshot.points_visible ? entry.points : null },
    }, { headers });
  } catch (error) {
    console.error("Could not read leaderboard snapshot:", error);
    return NextResponse.json({ error: "Could not load the data. Please try again later." }, { status: 503, headers });
  }
}
