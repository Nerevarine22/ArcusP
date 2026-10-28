import { emptyExtendedMarket, loadExtendedMarket, type FdvEvent, type HeisenbergQuery } from "./extended-market";
export type { ExtendedMarketSnapshot as VariationalMarketSnapshot } from "./extended-market";

export const VARIATIONAL_EVENT: FdvEvent = {
  slug: "variational-fdv-above-one-day-after-launch",
  project: "Variational",
  title: "Variational FDV above ___ one day after launch?",
  url: "https://polymarket.com/event/variational-fdv-above-one-day-after-launch",
};

export const emptyVariationalMarket = (status: "unavailable" | "not_configured", message: string, now = Date.now()) =>
  emptyExtendedMarket(status, message, now, VARIATIONAL_EVENT);
export const loadVariationalMarket = (query: HeisenbergQuery, now = Date.now()) => loadExtendedMarket(query, now, VARIATIONAL_EVENT);
