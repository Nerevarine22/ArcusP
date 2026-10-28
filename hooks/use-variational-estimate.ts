"use client";

import { useMemo, useSyncExternalStore } from "react";
import { VARIATIONAL_DEFAULTS, parseVariationalSettings, type VariationalSettings } from "@/lib/variational-estimator";

const storageKey = "variational-estimate-v1";
const changeEvent = "variational-estimate-change";
let remembered = JSON.stringify(VARIATIONAL_DEFAULTS);

function getSnapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(VARIATIONAL_DEFAULTS); }
  catch { /* Keep settings in memory when storage is unavailable. */ }
  return remembered;
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) onChange(); };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
  };
}
function updateSettings(patch: Partial<VariationalSettings>) {
  remembered = JSON.stringify({ ...parseVariationalSettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); } catch { /* Retain the current tab's settings. */ }
  window.dispatchEvent(new Event(changeEvent));
}
const getServerSnapshot = () => null;

export function useVariationalEstimate() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [useMemo(() => parseVariationalSettings(snapshot), [snapshot]), updateSettings] as const;
}
