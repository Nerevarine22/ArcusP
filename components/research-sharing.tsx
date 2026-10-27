"use client";

import { useId } from "react";
import type { ResearchStatus } from "@/lib/research-data";

export default function ResearchSharing({ checked, onChange, status }: { checked: boolean; onChange: (value: boolean) => void; status?: ResearchStatus }) {
  const id = useId();
  return <div className="research-sharing">
    <label htmlFor={id}><input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-describedby={`${id}-description`} /><span>Share this analysis for community research</span></label>
    <p id={`${id}-description`}>Save this wallet address, points and trading metrics to a private research dataset. Repeat analyses update the same wallet record. New points are shared when you analyze again. Turning this off stops future sharing.</p>
    {checked && status && <p className={`research-sharing-status research-${status.status}`} role="status">{status.message}</p>}
  </div>;
}
