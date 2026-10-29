"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ENTROPY_DEFAULTS, parseEntropySettings, type EntropySettings } from "@/lib/entropy-wallet";

const storageKey = "entropy-wallet-v1", changeEvent = "entropy-wallet-change";
let remembered = JSON.stringify(ENTROPY_DEFAULTS);
function getSnapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(ENTROPY_DEFAULTS); } catch { /* Retain tab settings if storage is blocked. */ }
  return remembered;
}
function subscribe(onChange: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) onChange(); };
  window.addEventListener(changeEvent, onChange); window.addEventListener("storage", storage); window.addEventListener("pageshow", onChange);
  return () => { window.removeEventListener(changeEvent, onChange); window.removeEventListener("storage", storage); window.removeEventListener("pageshow", onChange); };
}
function update(patch: Partial<EntropySettings>) {
  remembered = JSON.stringify({ ...parseEntropySettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); } catch { /* Keep settings in memory. */ }
  window.dispatchEvent(new Event(changeEvent));
}
const serverSnapshot = () => null;
export function useEntropyWallet() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  return [useMemo(() => parseEntropySettings(snapshot), [snapshot]), update, snapshot !== null] as const;
}
