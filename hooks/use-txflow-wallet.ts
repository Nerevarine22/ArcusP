"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TXFLOW_PERIODS, type TxflowPeriod } from "@/lib/txflow-wallet";

type Settings = { address: string; period: TxflowPeriod; points: Record<string, string> };
const defaults: Settings = { address: "", period: "EPOCH_1", points: {} };
const key = "txflow-wallet-v1", eventName = "txflow-wallet-change";
let remembered = JSON.stringify(defaults);
function snapshot() {
  try { remembered = localStorage.getItem(key) ?? JSON.stringify(defaults); } catch { /* Use the current tab's settings. */ }
  return remembered;
}
function read(raw: string | null): Settings {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;
    const points: Record<string, string> = {};
    if (saved.points && typeof saved.points === "object" && !Array.isArray(saved.points)) for (const [pointKey, value] of Object.entries(saved.points).slice(-500)) {
      if (/^0x[0-9a-f]{40}:(ALLTIME|S0|EPOCH_1|24H|7D|30D|90D)$/.test(pointKey) && typeof value === "string" && value.length <= 100) points[pointKey] = value;
    }
    return { address: typeof saved.address === "string" ? saved.address.slice(0, 42) : "", period: typeof saved.period === "string" && Object.hasOwn(TXFLOW_PERIODS, saved.period) ? saved.period : defaults.period, points };
  } catch { return defaults; }
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) onChange(); };
  window.addEventListener(eventName, onChange); window.addEventListener("storage", onStorage); window.addEventListener("pageshow", onChange);
  return () => { window.removeEventListener(eventName, onChange); window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", onChange); };
}
function update(patch: Partial<Settings>) {
  remembered = JSON.stringify({ ...read(snapshot()), ...patch });
  try { localStorage.setItem(key, remembered); } catch { /* Settings still survive navigation in this tab. */ }
  window.dispatchEvent(new Event(eventName));
}
const serverSnapshot = () => null;
export function useTxflowWallet() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const settings = useMemo(() => read(value), [value]);
  return [settings, update, value !== null] as const;
}
