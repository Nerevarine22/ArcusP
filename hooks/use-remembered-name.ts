"use client";

import { useSyncExternalStore } from "react";

const storageKey = "arcus-name";
const changeEvent = "arcus-name-change";
let rememberedName = "";

function getName() {
  try {
    rememberedName = (localStorage.getItem(storageKey) ?? "").slice(0, 100);
  } catch {
    // Keep navigation working when browser storage is unavailable.
  }
  return rememberedName;
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

function rememberName(value: string) {
  rememberedName = value.slice(0, 100);
  try {
    if (rememberedName) localStorage.setItem(storageKey, rememberedName);
    else localStorage.removeItem(storageKey);
  } catch {
    // The in-memory value still survives navigation within this tab.
  }
  window.dispatchEvent(new Event(changeEvent));
}

const getServerName = () => "";

export function useRememberedName() {
  const name = useSyncExternalStore(subscribe, getName, getServerName);
  return [name, rememberName] as const;
}
