"use client";

import { useSyncExternalStore } from "react";

const storageKey = "arcus-wallet-address";
const changeEvent = "arcus-wallet-address-change";
let rememberedAddress = "";

function getAddress() {
  try { rememberedAddress = (localStorage.getItem(storageKey) ?? "").slice(0, 42); }
  catch { /* Keep the address in memory if browser storage is unavailable. */ }
  return rememberedAddress;
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

function rememberAddress(value: string) {
  rememberedAddress = value.slice(0, 42);
  try {
    if (rememberedAddress) localStorage.setItem(storageKey, rememberedAddress);
    else localStorage.removeItem(storageKey);
  } catch { /* This tab still remembers the address across navigation. */ }
  window.dispatchEvent(new Event(changeEvent));
}

const getServerAddress = () => "";

export function useRememberedWallet() {
  const address = useSyncExternalStore(subscribe, getAddress, getServerAddress);
  return [address, rememberAddress] as const;
}
