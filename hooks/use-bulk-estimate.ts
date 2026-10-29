"use client";

import { useMemo, useSyncExternalStore } from "react";
import { BULK_DEFAULTS, parseBulkSettings, type BulkSettings } from "@/lib/bulk-estimator";

const storageKey = "bulk-estimate-v1", changeEvent = "bulk-estimate-change";
let remembered = JSON.stringify(BULK_DEFAULTS);
function getSnapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(BULK_DEFAULTS); }
  catch { /* Keep this tab's settings when storage is unavailable. */ }
  return remembered;
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) onChange(); };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onChange);
  return () => { window.removeEventListener(changeEvent, onChange); window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", onChange); };
}
function updateSettings(patch: Partial<BulkSettings>) {
  remembered = JSON.stringify({ ...parseBulkSettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); } catch { /* Retain the current calculation in memory. */ }
  window.dispatchEvent(new Event(changeEvent));
}
const getServerSnapshot = () => null;
export function useBulkEstimate() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [useMemo(() => parseBulkSettings(snapshot), [snapshot]), updateSettings] as const;
}
