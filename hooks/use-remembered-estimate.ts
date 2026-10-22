"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ASSUMED_TOTAL_POINTS, FDV_PRESETS } from "@/lib/estimator";

type EstimateSettings = {
  pointsInput: string;
  totalInput: string;
  fdv: number;
  allocation: number;
  perPoint: boolean;
  linkedName: string | null;
};

const defaults: EstimateSettings = { pointsInput: "", totalInput: String(ASSUMED_TOTAL_POINTS), fdv: FDV_PRESETS[0], allocation: 10, perPoint: true, linkedName: null };
const storageKey = "arcus-estimate-v1";
const changeEvent = "arcus-estimate-change";
let rememberedEstimate = JSON.stringify(defaults);

function getSnapshot() {
  try { rememberedEstimate = localStorage.getItem(storageKey) ?? JSON.stringify(defaults); }
  catch { /* Use the in-memory calculation when storage is unavailable. */ }
  return rememberedEstimate;
}

function parseSettings(raw: string | null): EstimateSettings {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;
    return {
      pointsInput: typeof saved.pointsInput === "string" && saved.pointsInput.length <= 100 ? saved.pointsInput : defaults.pointsInput,
      totalInput: typeof saved.totalInput === "string" && saved.totalInput.length <= 100 ? saved.totalInput : defaults.totalInput,
      fdv: Number.isFinite(saved.fdv) && saved.fdv >= 500_000_000 && saved.fdv <= 3_000_000_000 ? saved.fdv : defaults.fdv,
      allocation: Number.isFinite(saved.allocation) && saved.allocation >= 5 && saved.allocation <= 15 ? saved.allocation : defaults.allocation,
      perPoint: typeof saved.perPoint === "boolean" ? saved.perPoint : defaults.perPoint,
      linkedName: typeof saved.linkedName === "string" && saved.linkedName.length <= 100 ? saved.linkedName : null,
    };
  } catch { return defaults; }
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

function updateEstimate(patch: Partial<EstimateSettings>) {
  rememberedEstimate = JSON.stringify({ ...parseSettings(getSnapshot()), ...patch });
  try { localStorage.setItem(storageKey, rememberedEstimate); }
  catch { /* The current tab still remembers the calculation. */ }
  window.dispatchEvent(new Event(changeEvent));
}

const getServerSnapshot = () => null;

export function useRememberedEstimate() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const settings = useMemo(() => parseSettings(snapshot), [snapshot]);
  return [settings, updateEstimate, snapshot !== null] as const;
}
