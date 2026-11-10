import { isJumperAddress, JUMPER_XP_API, normalizeJumperWallet } from "@/lib/jumper-wallet";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!isJumperAddress(address)) {
    return Response.json({ error: "Enter a valid EVM wallet address." }, { status: 400, headers });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(6_000)]);
  try {
    const response = await fetch(JUMPER_XP_API + address.toLowerCase(), {
      cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json" },
    });
    if (response.status === 404) return Response.json({ error: "No XP record was found for this wallet." }, { status: 404, headers });
    if (response.status === 429) return Response.json({ error: "The XP service is limiting requests. Try again shortly." }, { status: 429, headers });
    if (!response.ok) throw new Error("XP service unavailable.");
    return Response.json(normalizeJumperWallet(await response.json(), address), { headers });
  } catch {
    return Response.json({ error: signal.aborted ? "The XP request timed out. Try again." : "XP data is temporarily unavailable. Try again shortly." }, { status: 503, headers });
  }
}
