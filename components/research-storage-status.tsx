"use client";

import type { ResearchStatus } from "@/lib/research-data";

export default function ResearchStorageStatus({ status }: { status?: ResearchStatus }) {
  return <div className="research-storage">
    <p>Wallet addresses, points and trading metrics are saved privately for research when you analyze.</p>
    {status && <p className={`research-${status.status}`} role="status">{status.message}</p>}
  </div>;
}
