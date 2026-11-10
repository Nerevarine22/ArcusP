"use client";

import { useMemo, useSyncExternalStore } from "react";
import { JUMPER_WALLET_DEFAULTS, parseJumperWalletSettings, type JumperWalletSettings } from "@/lib/jumper-wallet";

const storageKey = "jumper-wallet-v1";
const changeEvent = "jumper-wallet-change";
let remembered = JSON.stringify(JUMPER_WALLET_DEFAULTS);

function snapshot() {
  try { remembered = localStorage.getItem(storageKey) ?? JSON.stringify(JUMPER_WALLET_DEFAULTS); }
  catch { /* Keep this tab's settings when browser storage is unavailable. */ }
  return remembered;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) onChange();
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
  };
}

function update(patch: Partial<JumperWalletSettings>) {
  remembered = JSON.stringify({ ...parseJumperWalletSettings(snapshot()), ...patch });
  try { localStorage.setItem(storageKey, remembered); }
  catch { /* Keep the latest result in this tab. */ }
  window.dispatchEvent(new Event(changeEvent));
}

const serverSnapshot = () => null;

export function useJumperWallet() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [useMemo(() => parseJumperWalletSettings(value), [value]), update, value !== null] as const;
}
