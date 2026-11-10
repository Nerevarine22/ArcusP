export const JUMPER_XP_API = "https://jumperxp.vercel.app/api/wallet/";
export const isJumperAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

export type JumperWalletResult = {
  address: string;
  points: number;
  position: number | null;
  fetchedAt: string;
};

export function normalizeJumperWallet(value: unknown, address: string, now = Date.now()): JumperWalletResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected XP response.");
  const data = value as Record<string, unknown>;
  if (data.address !== undefined && (typeof data.address !== "string" || data.address.toLowerCase() !== address.toLowerCase())) {
    throw new Error("XP response belongs to a different wallet.");
  }
  if (typeof data.points !== "number" || !Number.isFinite(data.points) || data.points < 0 || data.points > Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid XP amount.");
  }
  const position = data.position === 0 ? null : data.position;
  if (position !== null && (typeof position !== "number" || !Number.isSafeInteger(position) || position < 1)) {
    throw new Error("Invalid leaderboard position.");
  }
  return { address: address.toLowerCase(), points: data.points, position, fetchedAt: new Date(now).toISOString() };
}

export type JumperWalletSettings = { address: string; result: JumperWalletResult | null };
export const JUMPER_WALLET_DEFAULTS: JumperWalletSettings = { address: "", result: null };

export function parseJumperWalletSettings(raw: string | null): JumperWalletSettings {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return JUMPER_WALLET_DEFAULTS;
    const address = typeof saved.address === "string" ? saved.address.slice(0, 42) : "";
    const settings: JumperWalletSettings = { address, result: null };
    if (isJumperAddress(address.trim()) && saved.result && typeof saved.result.fetchedAt === "string") {
      const fetchedAt = Date.parse(saved.result.fetchedAt);
      try {
        if (Number.isFinite(fetchedAt)) settings.result = normalizeJumperWallet(saved.result, address.trim(), fetchedAt);
      } catch { /* Discard a corrupted result while keeping the entered address. */ }
    }
    return settings;
  } catch {
    return { address: "", result: null };
  }
}
