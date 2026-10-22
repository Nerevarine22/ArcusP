"use client";

import { useMemo, useSyncExternalStore } from "react";
import { TXFLOW_DEFAULTS, parseTxflowSettings, type TxflowSettings } from "@/lib/txflow-estimator";
const storageKey = "txflow-estimate-v1";
const changeEvent = "txflow-estimate-change";
let remembered = JSON.stringify(TXFLOW_DEFAULTS);

function getSnapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(TXFLOW_DEFAULTS); }
  catch { /* Keep the calculation in memory when browser storage is unavailable. */ }
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

function updateSettings(patch: Partial<TxflowSettings>) {
  remembered = JSON.stringify({ ...parseTxflowSettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); }
  catch { /* The current tab still remembers the settings. */ }
  window.dispatchEvent(new Event(changeEvent));
}

const getServerSnapshot = () => null;

export function useTxflowEstimate() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const settings = useMemo(() => parseTxflowSettings(snapshot), [snapshot]);
  return [settings, updateSettings] as const;
}
