import { analyzeTxHolding, groupTxFills, summarizeTxFills, summarizeTxFunding, txAtoms, txUsd, type TxFill, type TxFunding, type TxScan } from "./txflow-wallet";
import { risexEpochs, risexRollingDays, risexScopeEpochs, risexWeekMs, type RisexEpoch } from "./risex-epochs";

const scale = BigInt("1000000000000000000");
const zero = BigInt(0);

export function riseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected RISEx response.");
  return value as Record<string, unknown>;
}

function riseTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) throw new Error("Invalid RISEx trade time.");
  const time = Number(BigInt(value) / BigInt(1_000_000));
  if (time <= 0 || time > 8.64e15) throw new Error("Invalid RISEx trade time.");
  return time;
}

function text(value: unknown) {
  if (typeof value !== "string" || !value) throw new Error("Missing RISEx field.");
  return value;
}

function optionalAmount(value: unknown) {
  return value == null || value === "" ? null : txUsd(txAtoms(value));
}

export function riseMarketNames(value: unknown) {
  const { markets } = riseRecord(value);
  if (!Array.isArray(markets)) throw new Error("Missing RISEx market list.");
  return new Map(markets.map(item => {
    const row = riseRecord(item);
    return [text(row.market_id), text(row.display_name || row.base_asset_symbol)] as const;
  }));
}

export function riseFill(value: unknown): TxFill {
  const row = riseRecord(value);
  const instrument = text(row.market_id);
  const chain = riseRecord(row.blockchain_data);
  const block = text(chain.block_number), log = text(chain.log_index);
  if (!/^\d{1,18}$/.test(block) || !/^\d{1,10}$/.test(log)) throw new Error("Invalid RISEx execution sequence.");
  const size = txAtoms(row.size), price = txAtoms(row.price);
  if (size <= zero || price <= zero || (row.side !== "BUY" && row.side !== "SELL")) throw new Error("Invalid RISEx execution.");
  const role = row.liquidity_indicator === "MAKER" ? "Maker" : row.liquidity_indicator === "TAKER" ? "Taker" : "Unknown";
  const beforeEntry = optionalAmount(row.avg_price);
  return {
    key: `${text(row.id)}:${text(row.order_id)}`, market: `Market #${instrument}`, instrument,
    side: row.side, role, size: txUsd(size), notional: txUsd((price * size + scale / BigInt(2)) / scale),
    fee: txUsd(txAtoms(row.fee)), feeToken: "USDC", closedPnl: optionalAmount(row.realized_pnl) ?? "0",
    time: riseTime(row.time), sequence: block + log.padStart(10, "0"),
    marginMode: String(row.margin_mode ?? 0),
    startPosition: beforeEntry === "0" ? "0" : null,
  };
}

export function riseFunding(value: unknown): TxFunding | null {
  const row = riseRecord(value);
  if (typeof row.is_settled !== "boolean") throw new Error("Missing RISEx funding status.");
  if (!row.is_settled || row.entry_type === "dividend") return null;
  const market = text(row.market_id), time = riseTime(row.block_time);
  return { key: `${market}:${time}:${String(row.tx_hash)}`, market, time, amount: txUsd(-txAtoms(row.funding_payment)) };
}

export function risePortfolio(value: unknown) {
  const data = riseRecord(value);
  const summary = riseRecord(data.summary);
  if (!Array.isArray(data.positions)) throw new Error("Missing RISEx positions.");
  const positions = data.positions.flatMap(item => {
    const row = riseRecord(item), size = txAtoms(row.size);
    if (size === zero) return [];
    const mark = optionalAmount(row.mark_price);
    const absolute = size < zero ? -size : size;
    return [{
      market: text(row.market_name), size: txUsd(size), entryPrice: optionalAmount(row.avg_entry_price),
      markPrice: mark, liquidationPrice: optionalAmount(row.liquidation_price),
      notional: mark === null ? null : txUsd((absolute * txAtoms(mark) + scale / BigInt(2)) / scale),
      unrealizedPnl: optionalAmount(row.unrealized_pnl), leverage: optionalAmount(row.leverage),
      marginMode: row.margin_mode === 1 ? "Isolated" : row.margin_mode === 0 ? "Cross" : null,
    }];
  });
  return {
    equity: optionalAmount(summary.total_account_value), balance: optionalAmount(summary.usdc_balance),
    freeCollateral: optionalAmount(summary.free_collateral), unrealizedPnl: optionalAmount(summary.total_unrealized_pnl),
    positions,
  };
}

export function riseTransfers(value: unknown) {
  const { items } = riseRecord(value);
  if (!Array.isArray(items)) throw new Error("Missing RISEx transfers.");
  return items.map(item => {
    const row = riseRecord(item);
    return {
      time: riseTime(row.block_time), type: text(row.type), amount: txUsd(txAtoms(row.amount)),
      token: text(row.token_address), hash: text(row.transaction_hash),
    };
  });
}

export function riseEpoch(value: unknown) {
  const { epoch } = riseRecord(value);
  if (epoch == null) return null;
  const row = riseRecord(epoch);
  const from = Number(row.starts_at) * 1000, to = Number(row.ends_at) * 1000;
  const distribution = Number(row.distribution_at) * 1000;
  if (![from, to, distribution].every(time => Number.isSafeInteger(time) && time > 0 && time <= 8.64e15)
    || from >= to || to > distribution) throw new Error("Invalid RISEx epoch.");
  return { label: text(row.epoch_id), from, to, distribution };
}

export async function scanRisex<T extends { time: number; key: string }>(
  fetchPage: (page: number) => Promise<unknown>,
  normalize: (value: unknown) => T | null,
  options: { field: string; limit: number; deduplicate?: boolean; label: string },
): Promise<TxScan<T>> {
  const rows: T[] = [];
  const keys = new Set<string>();
  const warnings: string[] = [];
  let pages = 0;
  let omitted = false;
  for (let page = 1; page <= options.limit; page++) {
    try {
      const result = riseRecord(await fetchPage(page));
      const items = result[options.field];
      if (Number(result.page) !== page || !Array.isArray(items) || typeof result.has_next_page !== "boolean") throw new Error("Invalid RISEx page.");
      if (items.length === 0 && result.has_next_page) throw new Error("Empty RISEx page.");
      pages++;
      for (const item of items) {
        try {
          const row = normalize(item);
          if (!row) continue;
          if (options.deduplicate && keys.has(row.key)) {
            omitted = true;
            continue;
          }
          if (options.deduplicate) keys.add(row.key);
          rows.push(row);
        } catch { omitted = true; }
      }
      if (!result.has_next_page) {
        if (omitted) warnings.push(`Some ${options.label} rows could not be counted reliably.`);
        return { rows, pages, status: omitted ? "partial" : "complete", warnings };
      }
    } catch {
      warnings.push(`RISEx ${options.label} could not be loaded in full.`);
      return { rows, pages, status: pages ? "partial" : "unavailable", warnings };
    }
  }
  warnings.push(`The ${options.label} scan reached its page limit. Older activity may be missing.`);
  return { rows, pages, status: "partial", warnings };
}

function weekStart(time: number) {
  const day = Math.floor(time / 86_400_000);
  return (day - (day + 3) % 7) * 86_400_000;
}

export function buildRisexReport(options: {
  address: string; now: number; trades: TxScan<TxFill>; funding: TxScan<TxFunding>;
  portfolio: ReturnType<typeof risePortfolio> | null; transfers: ReturnType<typeof riseTransfers> | null;
  epoch: ReturnType<typeof riseEpoch>; warnings: string[];
}) {
  const { address, now, trades, funding, portfolio, transfers, epoch, warnings } = options;
  const history = trades.rows.filter(row => row.time < now);
  const fundingRows = funding.rows.filter(row => row.time < now);
  const weeks = new Set([...history, ...fundingRows].map(row => weekStart(row.time)));
  weeks.add(weekStart(now));
  function summarizeRange(from: number | null, to: number, epochs?: RisexEpoch[]) {
    const windows = epochs?.map(epoch => ({ from: epoch.from, to: epoch.to, endExclusive: true }));
    const selected = <T extends { time: number }>(rows: T[]) => rows.filter(row =>
      (from === null || row.time >= from) && row.time < to &&
      (!windows || windows.some(window => (window.from === null || row.time >= window.from) && row.time < window.to)));
    const fills = selected(history);
    const canSummarizeTrades = trades.status === "complete" || fills.length > 0;
    const payments = selected(fundingRows);
    const { markets, days } = groupTxFills(fills);
    return {
      from, to, summary: canSummarizeTrades ? summarizeTxFills(fills) : null, markets, days: days.slice(-14),
      funding: funding.status === "complete" || payments.length ? summarizeTxFunding(payments) : null,
      holding: fills.length ? analyzeTxHolding(history, {
        from, to, endExclusive: true, selectedComplete: trades.status === "complete",
        historyStatus: trades.status, historyPages: trades.pages, windows,
      }) : null,
    };
  }
  const ranges = new Map<string, ReturnType<typeof summarizeRange>>();
  function range(from: number | null, to: number) {
    const key = `${from}:${to}`;
    const cached = ranges.get(key);
    if (cached) return cached;
    const result = summarizeRange(from, to);
    ranges.set(key, result);
    return result;
  }
  const schedule = risexEpochs(now, epoch);
  function combined(scope: "awarded" | "season1") {
    const included = risexScopeEpochs(schedule, scope);
    if (!included.length) return null;
    return summarizeRange(included[0].from, included[included.length - 1].to, included);
  }
  const rolling = Object.fromEntries(Object.entries(risexRollingDays).map(([id, days]) => [
    id, range(now - days * 86_400_000, now),
  ])) as Record<keyof typeof risexRollingDays, ReturnType<typeof summarizeRange>>;
  return {
    version: 3, address, fetchedAt: now,
    tradesStatus: trades.status, fundingStatus: funding.status,
    warnings: [...trades.warnings, ...funding.warnings, ...warnings],
    total: range(null, now),
    awarded: combined("awarded"),
    season1: combined("season1"),
    rolling,
    weeks: [...weeks].sort((a, b) => b - a).map(from => ({ ...range(from, Math.min(now, from + risexWeekMs)), from, end: from + risexWeekMs })),
    epochs: schedule.map(window => ({
      ...window,
      activity: window.from === null || window.from < now ? range(window.from, Math.min(now, window.to)) : null,
    })),
    portfolio, transfers,
  };
}

export type RisexReport = ReturnType<typeof buildRisexReport>;
