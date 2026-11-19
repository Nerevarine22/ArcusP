export const VARIATIONAL_PREMARKET_URL = "https://app.lighter.xyz/trade/VARIATIONAL";
export const VARIATIONAL_LIGHTER_MARKET_ID = 4098;
export const VARIATIONAL_LIGHTER_API = `https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=${VARIATIONAL_LIGHTER_MARKET_ID}`;
export type VariationalPremarketQuote = {
  price: number;
  priceType: "mark";
  marketId: number;
  fetchedAt: string;
};

export function parseVariationalPremarket(payload: unknown, now = Date.now()): VariationalPremarketQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { code?: unknown; order_book_details?: unknown };
  if (data.code !== 200 || !Array.isArray(data.order_book_details)) return null;
  const markets = data.order_book_details.filter(row => row?.symbol === "VARIATIONAL");
  if (markets.length !== 1) return null;
  const market = markets[0];
  if (market.market_id !== VARIATIONAL_LIGHTER_MARKET_ID || market.market_type !== "perp"
    || market.status !== "active" || market.is_frozen === true
    || typeof market.multiplier !== "string" || !/^1(?:\.0+)?$/.test(market.multiplier) || market.quote_multiplier !== 1) return null;
  if (typeof market.mark_price !== "string" || !/^\d+(?:\.\d+)?$/.test(market.mark_price)) return null;
  const price = Number(market.mark_price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, priceType: "mark", marketId: market.market_id, fetchedAt: new Date(now).toISOString() };
}

/** A price-derived valuation depends on the user's assumed total supply. */
export function variationalPremarketFdv(price: number | null, supply: number | null): number | null {
  if (price === null || supply === null || !Number.isFinite(price) || !Number.isFinite(supply) || price <= 0 || supply <= 0) return null;
  const fdv = price * supply;
  return Number.isFinite(fdv) && fdv > 0 ? fdv : null;
}
