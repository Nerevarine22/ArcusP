import Link from "next/link";
import { featureFlags } from "@/lib/features";
import { latestRisexDistribution as distribution } from "@/lib/risex-distributions";

const number = new Intl.NumberFormat("en-US");

export default function RisexHeader({ tool }: { tool: "calculator" | "wallet" }) {
  return <>
    <header className="rx-header">
      <Link className="rx-brand" href="/risex" aria-label="RISEx points calculator">
        <img src="/brand/risex/logo.svg" alt="RISEx" width="112" height="27" />
        <span>{tool === "calculator" ? "Points calculator" : "Wallet analytics"}</span>
      </Link>
      <nav aria-label="RISEx navigation">
        {featureFlags.multiExchange && <Link href="/">← All projects</Link>}
        <a className="rx-exchange" href="https://www.rise.trade/" target="_blank" rel="noopener noreferrer">Open RISEx <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <nav className="rx-tool-nav" aria-label="RISEx tools">
      <Link href="/risex" aria-current={tool === "calculator" ? "page" : undefined}>Points calculator</Link>
      <Link href="/risex/wallet" aria-current={tool === "wallet" ? "page" : undefined}>Wallet analytics</Link>
    </nav>
    <aside className="rx-distribution" aria-label="Latest points distribution">
      <div>
        <strong>Season {distribution.season} · Week {distribution.week} distributed</strong>
        <p>{number.format(distribution.points)} RISE Points across {number.format(distribution.accounts)} accounts.</p>
        <p>Announced <time dateTime={distribution.publishedAt}>24 Nov 2026, 14:07 UTC</time>. Project-wide distribution; your points may differ.</p>
      </div>
      <a href={distribution.source} target="_blank" rel="noopener noreferrer">Official announcement ↗</a>
    </aside>
  </>;
}
