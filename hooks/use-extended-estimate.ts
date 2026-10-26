"use client";

import { useMemo, useSyncExternalStore } from "react";
import { EXTENDED_DEFAULTS, parseExtendedSettings, type ExtendedSettings } from "@/lib/extended-estimator";

const storageKey = "extended-estimate-v1";
const changeEvent = "extended-estimate-change";
let remembered = JSON.stringify(EXTENDED_DEFAULTS);

function getSnapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(EXTENDED_DEFAULTS); }
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
function updateSettings(patch: Partial<ExtendedSettings>) {
  remembered = JSON.stringify({ ...parseExtendedSettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); } catch { /* Retain the current tab's settings. */ }
  window.dispatchEvent(new Event(changeEvent));
}
const getServerSnapshot = () => null;

export function useExtendedEstimate() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [useMemo(() => parseExtendedSettings(snapshot), [snapshot]), updateSettings] as const;
}
