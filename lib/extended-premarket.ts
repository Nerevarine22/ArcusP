export const EXTENDED_PREMARKET_URL = "https://app.hyperliquid.xyz/trade/XTEN";

export function parseExtendedMarkPrice(payload: unknown): number | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0]?.universe) || !Array.isArray(payload[1])) return null;
  const index = payload[0].universe.findIndex((asset: { name?: string; isDelisted?: boolean } | null) => asset?.name === "XTEN" && asset.isDelisted !== true);
  if (index === -1) return null;
  const price = payload[1][index]?.markPx;
  if (typeof price !== "string") return null;
  const markPrice = Number(price);
  return Number.isFinite(markPrice) && markPrice > 0 ? markPrice : null;
}
