import { analyzeTxHolding, groupTxFills, summarizeTxFills, summarizeTxFunding, txAtoms, txUsd, type TxFill, type TxFunding, type TxScan, type TxSummary, type TxHoldingAnalysis } from "./txflow-wallet";

const zero = BigInt(0), scale = BigInt("1000000000000000000");
const week = 7 * 86400000;
export const BULK_TRADING_START = Date.parse("2026-09-05T13:00:00Z");
export type BulkEpoch = { id: string; label: string; start: number; end: number; predeposit: boolean; completed: boolean };
export function bulkEpochs(now: number): BulkEpoch[] {
  const epochs: BulkEpoch[] = [{ id: "PRE", label: "Pre-deposit", start: Date.parse("2026-06-01T00:00:00Z"), end: BULK_TRADING_START, predeposit: true, completed: now >= BULK_TRADING_START }];
  for (let index = 0; index < 104 && BULK_TRADING_START + index * week <= now; index++) epochs.push({ id: `T${index + 1}`, label: `Trading week ${index + 1}`, start: BULK_TRADING_START + index * week, end: BULK_TRADING_START + (index + 1) * week, predeposit: false, completed: now >= BULK_TRADING_START + (index + 1) * week });
  return epochs;
}
export function isBulkAddress(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let decoded = zero; for (const char of value) decoded = decoded * BigInt(58) + BigInt(alphabet.indexOf(char));
  let bytes = 0; while (decoded > zero) { bytes++; decoded >>= BigInt(8); }
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
export type BulkWalletSettings = { address: string; selected: string; points: Record<string, string> };
export const BULK_WALLET_DEFAULTS: BulkWalletSettings = { address: "", selected: "ALL", points: {} };
export function parseBulkWalletSettings(raw: string | null): BulkWalletSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return BULK_WALLET_DEFAULTS;
    const points: Record<string, string> = {};
    if (value.points && typeof value.points === "object" && !Array.isArray(value.points)) for (const [key, input] of Object.entries(value.points).slice(-1000)) {
      const [address, epoch] = key.split(":");
      if (key.split(":").length === 2 && isBulkAddress(address) && /^(PRE|T[1-9]\d?)$/.test(epoch) && typeof input === "string" && input.length <= 100) points[key] = input;
    }
    return { address: typeof value.address === "string" ? value.address.slice(0,44) : "", selected: typeof value.selected === "string" && /^(ALL|COMPLETED|PRE|T[1-9]\d?)$/.test(value.selected) ? value.selected : "ALL", points };
  } catch { return BULK_WALLET_DEFAULTS; }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected BULK response.");
  return value as Record<string, unknown>;
}
function integer(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value) || !/^\d{1,24}$/.test(String(value))) throw new Error("Invalid BULK history identifier.");
  return String(value);
}
export function bulkTimestamp(value: unknown): number {
  const timestamp = BigInt(integer(value));
  // Account history schemas specify nanoseconds, unlike general HTTP overview text.
  const millis = timestamp / BigInt(1000000);
  if (millis > BigInt(8640000000000000)) throw new Error("Invalid BULK timestamp.");
  return Number(millis);
}
function amount(value: unknown) {
  if (typeof value !== "string" || value.length > 100 || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error("Invalid BULK amount.");
  return txUsd(txAtoms(value));
}
function symbol(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,80}$/.test(value)) throw new Error("Invalid BULK market.");
  return value;
}
function ownerOf(row: Record<string, unknown>, address: string) {
  if (row.iso === true) {
    if (!isBulkAddress(row.isoPubkey)) throw new Error("An isolated execution is missing its account key.");
    return row.isoPubkey;
  }
  return address;
}
export type BulkFill = TxFill & { timeNs: string; slot: string; eventSequence: string; owner: string; feeConvention: "cash-flow" | "cost" };
export function normalizeBulkFill(value: unknown, address: string): BulkFill {
  const row = record(value), owner = ownerOf(row,address);
  if (typeof row.isBuy !== "boolean") throw new Error("Invalid BULK execution side.");
  const slot = integer(row.slot), eventSequence = integer(row.sequence), timeNs = integer(row.timestamp);
  const tradeId = row.tradeId === undefined ? `${slot}:${eventSequence}` : row.tradeId;
  if (typeof tradeId !== "string" || tradeId !== `${slot}:${eventSequence}`) throw new Error("BULK execution ID does not match its slot and sequence.");
  const role = row.maker === owner && row.taker !== owner ? "Maker" : row.taker === owner && row.maker !== owner ? "Taker" : "Unknown";
  const size = amount(row.amount), price = amount(row.price), effectiveFee = amount(row.fee);
  if (txAtoms(size) <= zero || txAtoms(price) <= zero) throw new Error("BULK execution size and price must be positive.");
  // Legacy live rows omit tradeId and report fee balance deltas (negative = paid).
  // The documented tradeId schema reports costs (negative = rebate). Keep both explicit.
  const feeConvention = row.tradeId === undefined ? "cash-flow" : "cost";
  if (role !== "Unknown" && txAtoms(effectiveFee) !== txAtoms(amount(role === "Maker" ? row.makerFee : row.takerFee))) throw new Error("BULK effective fee does not match the execution role.");
  const market = symbol(row.symbol);
  return { key: `${owner}:${tradeId}`, owner, market, instrument: `${owner}:${market}`, marginMode: row.iso === true ? "isolated" : "cross", side: row.isBuy ? "BUY" : "SELL", size, startPosition: null, sequence: "0", time: bulkTimestamp(timeNs), timeNs, slot, eventSequence,
    notional: txUsd((txAtoms(size) * txAtoms(price) + scale / BigInt(2)) / scale), fee: txUsd(txAtoms(effectiveFee) * BigInt(feeConvention === "cash-flow" ? -1 : 1)), feeToken: "USDC", role, closedPnl: "0", feeConvention };
}
export function normalizeBulkFunding(value: unknown, address: string): TxFunding {
  const row = record(value), owner = ownerOf(row,address);
  if (row.owner !== undefined && row.owner !== owner) throw new Error("BULK funding belongs to another account.");
  return { key: `${owner}:${integer(row.slot)}:${integer(row.sequence)}`, time: bulkTimestamp(row.timestamp), market: symbol(row.symbol), amount: amount(row.payment) };
}
export type BulkPosition = { key: string; owner: string; market: string; size: string; entryPrice: string; value: string; unrealizedPnl: string; leverage: string };
export type BulkAccount = { positions: BulkPosition[]; subaccounts: string[]; margin: string };
export function normalizeBulkAccount(value: unknown, address: string): BulkAccount {
  if (!Array.isArray(value)) throw new Error("Unexpected BULK account snapshot.");
  const accounts = value.map(record).filter(row => row.fullAccount !== undefined);
  if (accounts.length !== 1) throw new Error("BULK did not return an account snapshot.");
  const account = record(accounts[0].fullAccount), margin = record(account.margin);
  if (!Array.isArray(account.positions)) throw new Error("BULK positions are unavailable.");
  const positions = account.positions.map(value => {
    const row = record(value), owner = ownerOf(row,address), market = symbol(row.symbol);
    const signedValue = txAtoms(amount(row.notional));
    return { key: `${owner}:${market}`, owner, market, size: amount(row.size), entryPrice: amount(row.price), value: txUsd(signedValue < zero ? -signedValue : signedValue), unrealizedPnl: amount(row.unrealizedPnl), leverage: amount(row.leverage) };
  });
  const subaccounts = Array.isArray(account.subAccounts) ? account.subAccounts.map(value => record(value).pubkey).filter(isBulkAddress) : [];
  return { positions, subaccounts, margin: amount(margin.totalMargin) };
}
export type BulkScan<T> = TxScan<T> & { exhausted: boolean; coverage: string[] };
export async function collectBulkHistory<T extends { key: string }>(fetchPage: (cursor: string | null) => Promise<unknown>, normalize: (value: unknown) => T, maxPages = 12): Promise<BulkScan<T>> {
  const rows: T[] = [], seen = new Map<string,string>(), cursors = new Set<string>(), coverage = new Set<string>();
  let pages = 0, cursor: string | null = null;
  const finish = (status: TxScan<T>["status"], exhausted: boolean, warnings: string[] = []): BulkScan<T> => ({ rows, pages, status, exhausted, coverage: [...coverage], warnings });
  try {
    while (pages < maxPages) {
      const response = record(await fetchPage(cursor)), page = record(response.page);
      if (!Array.isArray(response.data) || response.data.length > 5000 || typeof page.hasMore !== "boolean") throw new Error("Invalid BULK history page.");
      const staged = new Map<string,T>();
      for (const raw of response.data) {
        const row = normalize(raw), previous = seen.get(row.key);
        if (previous && previous !== JSON.stringify(row) || staged.has(row.key) && JSON.stringify(staged.get(row.key)) !== JSON.stringify(row)) throw new Error("A BULK history row changed during pagination. Refresh the scan.");
        if (!previous) staged.set(row.key,row);
      }
      for (const row of staged.values()) { seen.set(row.key,JSON.stringify(row)); rows.push(row); }
      pages++; coverage.add(typeof page.coverage === "string" ? page.coverage : "unknown");
      if (!page.hasMore) return finish(coverage.size === 1 && coverage.has("complete") ? "complete" : "partial", true, coverage.size === 1 && coverage.has("complete") ? [] : ["BULK does not confirm complete historical coverage. Totals describe the loaded records."]);
      if (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 8192 || cursors.has(page.nextCursor)) throw new Error("BULK history cursor cannot advance safely.");
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    return finish("partial",false,["The history page limit was reached. Some executions may be missing."]);
  } catch (cause) { return finish(pages ? "partial" : "unavailable",false,[cause instanceof Error ? cause.message : "BULK history could not be read."]); }
}
export function anchorBulkFills(fills: BulkFill[], account: BulkAccount | null, exhausted: boolean): BulkFill[] {
  const ordered = [...fills].sort((a,b) => BigInt(a.timeNs) < BigInt(b.timeNs) ? -1 : BigInt(a.timeNs) > BigInt(b.timeNs) ? 1 : BigInt(a.slot) < BigInt(b.slot) ? -1 : BigInt(a.slot) > BigInt(b.slot) ? 1 : BigInt(a.eventSequence) < BigInt(b.eventSequence) ? -1 : BigInt(a.eventSequence) > BigInt(b.eventSequence) ? 1 : a.key.localeCompare(b.key));
  if (!account || !exhausted) return ordered.map((fill,index) => ({ ...fill, sequence: String(index) }));
  const ending = new Map(account.positions.map(position => [position.key,txAtoms(position.size)]));
  const result = ordered.map((fill,index) => ({ ...fill, sequence: String(index) }));
  for (let index = result.length - 1; index >= 0; index--) {
    const fill = result[index], delta = txAtoms(fill.size) * BigInt(fill.side === "BUY" ? 1 : -1);
    const start = (ending.get(fill.instrument) ?? zero) - delta;
    fill.startPosition = txUsd(start); ending.set(fill.instrument,start);
  }
  return result;
}
export type BulkPeriodReport = { id: string; label: string; from: string; to: string; completed: boolean; predeposit: boolean; epochIds: string[]; summary: TxSummary | null; funding: ReturnType<typeof summarizeTxFunding> | null; holding: TxHoldingAnalysis; markets: ReturnType<typeof groupTxFills>["markets"] };
export type BulkWalletReport = { version: 1; address: string; fetchedAt: string; epochs: BulkEpoch[]; periods: BulkPeriodReport[]; account: BulkAccount | null; fillsScan: Omit<BulkScan<BulkFill>,"rows">; fundingScan: Omit<BulkScan<TxFunding>,"rows">; feeConventions: string[]; warnings: string[] };
export function buildBulkReport(address: string, now: number, scan: BulkScan<BulkFill>, fundingScan: BulkScan<TxFunding>, account: BulkAccount | null): BulkWalletReport {
  const epochs = bulkEpochs(now), fills = anchorBulkFills(scan.rows.filter(fill=>fill.time<=now),account,scan.exhausted);
  const completed = epochs.filter(epoch=>!epoch.predeposit && epoch.completed);
  const definitions = [
    { id:"ALL", label:"All trading history", start:BULK_TRADING_START, end:now+1, predeposit:false, completed:false },
    { id:"COMPLETED", label:"Completed trading weeks", start:BULK_TRADING_START, end:completed.at(-1)?.end ?? BULK_TRADING_START, predeposit:false, completed:true },
    ...epochs,
  ];
  const periods = definitions.map(epoch => {
    const to = Math.min(epoch.end,now+1), inRange = (time:number)=>time>=epoch.start && time<to;
    const selected = fills.filter(fill=>inRange(fill.time));
    const summary = scan.status === "unavailable" || epoch.predeposit ? null : summarizeTxFills(selected);
    const holding = analyzeTxHolding(fills,{from:epoch.start,to:to,endExclusive:true,selectedComplete:scan.exhausted && !epoch.predeposit,historyStatus:scan.status,historyPages:scan.pages});
    if (account && scan.exhausted && !epoch.predeposit) { holding.status = holding.status === "incomplete" ? "incomplete" : "partial"; holding.notes.push("FIFO estimates are anchored to current positions and assume no missing fills inside the loaded history. Weekly boundaries are approximate."); }
    return { id:epoch.id,label:epoch.label,from:new Date(epoch.start).toISOString(),to:new Date(to).toISOString(),completed:epoch.completed,predeposit:epoch.predeposit,
      epochIds: epochs.filter(item=>!item.predeposit && item.start>=epoch.start && item.start<to).map(item=>item.id), summary,
      funding: fundingScan.status === "unavailable" || epoch.predeposit ? null : summarizeTxFunding(fundingScan.rows.filter(row=>inRange(row.time))), holding, markets: summary ? groupTxFills(selected).markets : [] };
  });
  const { rows: _fills,...fillsMeta } = scan, { rows: _funding,...fundingMeta } = fundingScan;
  const warnings = [...new Set([...scan.warnings,...fundingScan.warnings])];
  if (!account) warnings.push("Current positions are unavailable. Holding times cannot be anchored to the account snapshot.");
  if (account?.subaccounts.length) warnings.push(`${account.subaccounts.length} separate sub-account(s) found. This scan includes the entered account and its isolated lanes only. Query other sub-accounts using their own address.`);
  return { version:1,address,fetchedAt:new Date(now).toISOString(),epochs,periods,account,fillsScan:fillsMeta,fundingScan:fundingMeta,feeConventions:[...new Set(scan.rows.map(row=>row.feeConvention))],warnings };
}
