export const JUMPER_PREMARKET_URL = "https://trade.aspecta.ai/projects/usdt/Jumper";
export const JUMPER_ASPECTA_POOL = "0xe978b95E8c7a1012A7F9174C1c8977FB7c79a0D4";
export type JumperPremarketQuote = { price: number; fdv: number; fetchedAt: string };

/** Aspecta V3: sqrt price uses USDT decimals (18), keys use 2 decimals.
 * Settlement ratio returns adjustment bps, token units per raw long key, short key.
 * Convert to a future-token price, rather than treating the BuildKey price as JUMP.
 */
export function parseJumperPremarket(sqrtResult: unknown, ratioResult: unknown): { price: number; fdv: number } | null {
  if (typeof sqrtResult !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(sqrtResult)
    || typeof ratioResult !== "string" || !/^0x[0-9a-fA-F]{192}$/.test(ratioResult)) return null;
  const sqrt = BigInt(sqrtResult);
  const adjustment = BigInt("0x" + ratioResult.slice(2, 66));
  const tokensPerRawKey = BigInt("0x" + ratioResult.slice(66, 130));
  if (sqrt <= BigInt(0) || adjustment <= BigInt(0) || tokensPerRawKey <= BigInt(0)) return null;
  // Key decimals cancel between key price and the effective token-per-key ratio.
  const price = Number(sqrt * sqrt) * 10_000 / Number(tokensPerRawKey * adjustment) / 1e18;
  const fdv = price * 1_000_000_000;
  return Number.isFinite(price) && price > 0 && Number.isFinite(fdv) && fdv > 0 ? { price, fdv } : null;
}
