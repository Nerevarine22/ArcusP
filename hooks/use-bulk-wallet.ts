"use client";
import { useMemo, useSyncExternalStore } from "react";
import { BULK_WALLET_DEFAULTS, parseBulkWalletSettings, type BulkWalletSettings } from "@/lib/bulk-wallet";
const key = "bulk-wallet-v1", event = "bulk-wallet-change";
let memory = JSON.stringify(BULK_WALLET_DEFAULTS);
function snapshot() { try { memory = localStorage.getItem(key) ?? JSON.stringify(BULK_WALLET_DEFAULTS); } catch { /* Use in-memory settings. */ } return memory; }
function subscribe(change:()=>void) {
  const storage = (e:StorageEvent)=>{if(e.key===key||e.key===null)change();};
  window.addEventListener(event,change);window.addEventListener("storage",storage);window.addEventListener("pageshow",change);
  return ()=>{window.removeEventListener(event,change);window.removeEventListener("storage",storage);window.removeEventListener("pageshow",change);};
}
function update(patch:Partial<BulkWalletSettings>) { memory=JSON.stringify({...parseBulkWalletSettings(snapshot()),...patch});try{localStorage.setItem(key,memory);}catch{/* Keep the current tab usable. */}window.dispatchEvent(new Event(event)); }
const server=()=>null;
export function useBulkWallet() { const raw=useSyncExternalStore(subscribe,snapshot,server);return [useMemo(()=>parseBulkWalletSettings(raw),[raw]),update,raw!==null] as const; }
