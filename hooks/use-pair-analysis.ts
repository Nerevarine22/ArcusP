"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parsePairSession, type PairSession } from "@/lib/pair-analytics";

const key = "perp-wallet-pair-v1", event = "perp-wallet-pair-change";
let remembered = "";
let memoryOnly = false;
function snapshot() {
  if (!memoryOnly) {
    try { remembered = localStorage.getItem(key) ?? ""; } catch { memoryOnly = true; }
  }
  return remembered;
}
function subscribe(changed: () => void) {
  const storage = (value: StorageEvent) => { if (value.key === key || value.key === null) changed(); };
  window.addEventListener(event, changed); window.addEventListener("storage", storage); window.addEventListener("pageshow", changed);
  return () => { window.removeEventListener(event, changed); window.removeEventListener("storage", storage); window.removeEventListener("pageshow", changed); };
}
function update(patch: Partial<PairSession>) {
  remembered = JSON.stringify({ ...parsePairSession(snapshot()), ...patch });
  if (!memoryOnly) {
    try { localStorage.setItem(key, remembered); } catch { memoryOnly = true; }
  }
  window.dispatchEvent(new Event(event));
}
const serverSnapshot = () => null;
export function usePairAnalysis() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [useMemo(() => parsePairSession(raw), [raw]), update, raw !== null] as const;
}
