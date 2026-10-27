"use client";

import { useSyncExternalStore } from "react";
const key = "wallet-research-sharing-v1", eventName = "wallet-research-sharing-change";
let preference = false;
function snapshot() {
  try { preference = localStorage.getItem(key) === "true"; } catch { /* Keep the in-memory choice. */ }
  return preference;
}
function subscribe(change: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) change(); };
  window.addEventListener(eventName, change); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(eventName, change); window.removeEventListener("storage", storage); };
}
export function useResearchSharing() {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false);
  function update(value: boolean) {
    preference = value;
    try { localStorage.setItem(key, String(value)); } catch { /* Choice remains available in this tab. */ }
    window.dispatchEvent(new Event(eventName));
  }
  return [enabled, update] as const;
}
