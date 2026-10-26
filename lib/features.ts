// The project chooser and navigation are enabled by default.
// Set the public flag to false to disable them; rebuild after changing it.
export const featureFlags = {
  multiExchange: process.env.NEXT_PUBLIC_MULTI_EXCHANGE_ENABLED !== "false",
  // Server-only override for previewing TxFlow without restoring the hub.
  txflow: process.env.TXFLOW_ENABLED === "true",
};
