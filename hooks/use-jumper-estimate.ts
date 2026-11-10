"use client";

import { useMemo, useSyncExternalStore } from "react";
import { JUMPER_ESTIMATE_DEFAULTS, parseJumperEstimateSettings, type JumperEstimateSettings } from "@/lib/jumper-estimator";

const storageKey = "jumper-estimate-v1", changeEvent = "jumper-estimate-change";
let remembered = JSON.stringify(JUMPER_ESTIMATE_DEFAULTS);
function snapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(JUMPER_ESTIMATE_DEFAULTS); }
  catch { /* Keep this tab's settings if browser storage is unavailable. */ }
  return remembered;
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) onChange(); };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onChange);
  return () => { window.removeEventListener(changeEvent, onChange); window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", onChange); };
}
function update(patch: Partial<JumperEstimateSettings>) {
  remembered = JSON.stringify({ ...parseJumperEstimateSettings(snapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); } catch { /* Retain the calculation in this tab. */ }
  window.dispatchEvent(new Event(changeEvent));
}
const serverSnapshot = () => null;
export function useJumperEstimate() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [useMemo(() => parseJumperEstimateSettings(value), [value]), update] as const;
}
