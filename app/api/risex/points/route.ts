import { isRisexWallet, readRisexHistory } from "@/lib/risex-points";

const responseOptions = { headers: { "Cache-Control": "no-store" } };

function error(message: string, status: number) {
  return Response.json({ error: message }, { ...responseOptions, status });
}

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  if (!isRisexWallet(wallet)) return error("Enter a valid 0x wallet address.", 400);

  try {
    const upstream = await fetch(`https://api.rise.trade/v1/points/${wallet}/history`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return error("RISEx requires sign-in to read points history. Enter your points manually below.", 401);
    }
    if (upstream.status === 404) return error("No points history was found for this wallet.", 404);
    if (upstream.status === 429) return error("RISEx is limiting requests. Try again shortly.", 429);
    if (upstream.ok) {
      const history = readRisexHistory(await upstream.json());
      if (history?.epochs === 0) return error("No points history was found for this wallet.", 404);
      if (history) return Response.json(history, responseOptions);
    }
  } catch {
    // The calculator can still use the points the user entered manually.
  }

  return error("Points history is unavailable. Try again or enter your points manually.", 502);
}
