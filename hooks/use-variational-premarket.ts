"use client";

import { useEffect, useState } from "react";
import { type VariationalPremarketQuote } from "@/lib/variational-premarket";

export function useVariationalPremarket() {
  const [quote, setQuote] = useState<VariationalPremarketQuote | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch("/api/variational/premarket", {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        const data = response.ok ? await response.json() : null;
        if (typeof data?.price !== "number" || !Number.isFinite(data.price) || data.price <= 0
          || data.priceType !== "mark" || typeof data.fetchedAt !== "string"
          || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error("Premarket unavailable.");
        if (!controller.signal.aborted) setQuote(data);
      } catch {
        if (!controller.signal.aborted) setQuote(null);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
      else setQuote(null);
    }, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  return { quote, loading };
}
