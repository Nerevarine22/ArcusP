"use client";

import { useEffect, useRef, useState } from "react";

export default function ReferralOffer() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  async function copyCode() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText("ATOMS");
      setCopyState("copied");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }

  return <div className="referral-offer">
    <a className="referral-link" href="https://app.arcus.xyz/ref/ATOMS" target="_blank" rel="noopener noreferrer" aria-label="Receive 5% off on all trading fees (opens in a new tab)">
      <span>Receive 5% off on all trading fees</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>
    </a>
    <button type="button" className="referral-copy" onClick={copyCode} aria-label="Copy referral code ATOMS" title={copyState === "copied" ? "Copied!" : "Copy referral code ATOMS"}>
      <span className="referral-code">ATOMS</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copyState === "copied" ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>}
      </svg>
    </button>
    <span className={copyState === "failed" ? "copy-feedback" : "sr-only"} role="status">{copyState === "copied" ? "ATOMS copied to clipboard." : copyState === "failed" ? "Could not copy. Select ATOMS and copy it manually." : ""}</span>
  </div>;
}
