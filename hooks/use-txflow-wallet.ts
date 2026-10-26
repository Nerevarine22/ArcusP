"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TXFLOW_WALLET_DEFAULTS, parseTxflowWalletSettings, type TxflowWalletSettings } from "@/lib/txflow-wallet";

type Settings = TxflowWalletSettings;
const defaults = TXFLOW_WALLET_DEFAULTS;
const key = "txflow-wallet-v1", eventName = "txflow-wallet-change";
let remembered = JSON.stringify(defaults);
function snapshot() {
  try { remembered = localStorage.getItem(key) ?? JSON.stringify(defaults); } catch { /* Use the current tab's settings. */ }
  return remembered;
}
const read = parseTxflowWalletSettings;
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
