"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useJumperWallet } from "@/hooks/use-jumper-wallet";
import { useJumperEstimate } from "@/hooks/use-jumper-estimate";
import JumperScenarios from "@/components/jumper-scenarios";
import { featureFlags } from "@/lib/features";
import { isJumperAddress, JUMPER_XP_API, normalizeJumperWallet, type JumperWalletResult } from "@/lib/jumper-wallet";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const rankNumber = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

async function readWallet(url: string, address: string, signal: AbortSignal): Promise<JumperWalletResult> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (response.status === 404) throw new Error("No XP record was found for this wallet.");
  if (response.status === 429) throw new Error("The XP service is limiting requests. Try again shortly.");
  if (!response.ok) throw new Error("XP data is temporarily unavailable. Try again shortly.");
  return normalizeJumperWallet(await response.json(), address);
}

export default function JumperChecker() {
  const [settings, update, ready] = useJumperWallet();
  const [calculation, updateCalculation] = useJumperEstimate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const address = settings.address.trim().toLowerCase();
  const result = settings.result?.address === address ? settings.result : null;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setLoading(false);
    setError("");
  }, [address]);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    controller.current?.abort();
    setError("");
    if (!isJumperAddress(address)) {
      setError("Enter a valid EVM address starting with 0x and containing 40 hexadecimal characters.");
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    updateCalculation({ pointsInput: null });
    update({ result: null });
    try {
      let found: JumperWalletResult;
      try {
        found = await readWallet(`/api/jumper/wallet?address=${address}`, address, AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
      } catch (cause) {
        if (request.signal.aborted) throw cause;
        // Preserve the existing checker's direct lookup if its local proxy is unavailable.
        found = await readWallet(JUMPER_XP_API + address, address, AbortSignal.any([request.signal, AbortSignal.timeout(6_000)]));
      }
      if (!request.signal.aborted) update({ address, result: found });
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "XP data could not be loaded. Try again.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  const walletLookup = <section className="jp-wallet-lookup" aria-labelledby="jp-lookup-heading">
    <h3 id="jp-lookup-heading">Wallet address</h3>
        <form onSubmit={lookup} noValidate>
          <label className="sr-only" htmlFor="jp-wallet-address">Wallet address</label>
          <div className="jp-search">
            <div className="jp-address-field"><span className="jp-wallet-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M4 7V5h14v4M4 7h16v12H4V7Zm11 5h5v4h-5v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></span>
            <input id="jp-wallet-address" value={settings.address} onChange={event => {
              controller.current?.abort();
              setLoading(false);
              setError("");
              updateCalculation({ pointsInput: null });
              update({ address: event.target.value, result: null });
            }}
              maxLength={42} placeholder="0x…" autoComplete="off" spellCheck={false}
              aria-invalid={Boolean(error) && !isJumperAddress(address)} aria-describedby="jp-lookup-status" /></div>
            <button type="submit" disabled={loading || !ready}>{loading ? "Checking…" : "Check XP"}<span aria-hidden="true">↗</span></button>
          </div>
          <p id="jp-lookup-status" role="status" className={error ? "jp-error" : "jp-help"}>{error || (loading ? "Loading wallet XP and leaderboard position…" : "Enter a public EVM wallet address. Your lookup is saved in this browser.")}</p>
        </form>
    <div className="jp-wallet-result" aria-live="polite" aria-busy={loading}>
      <dl><div><dt>Wallet XP</dt><dd>{result ? number.format(result.points) : "—"}</dd></div><div><dt>Leaderboard position</dt><dd>{result ? result.position === null ? "Unranked" : `#${rankNumber.format(result.position)}` : "—"}</dd></div></dl>
      {result && <p className="jp-help">Checked {date.format(new Date(result.fetchedAt))} UTC</p>}
    </div>
  </section>;

  return <div className="jumper-page"><div className="jp-shell">
    <header className="jp-header">
      <Link className="jp-brand" href="/jumper" aria-label="Jumper points calculator">
        <img src="/brand/jumper/logo.svg" alt="Jumper" width="169" height="35" />
        <span>Points calculator</span>
      </Link>
      <nav aria-label="Jumper navigation">
        {featureFlags.multiExchange && <Link href="/">← All projects</Link>}
        <a className="jp-open" href="https://jumper.xyz/" target="_blank" rel="noopener noreferrer">Open Jumper <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <nav className="jp-tool-nav" aria-label="Jumper tools"><Link href="/jumper" aria-current="page">Points calculator</Link><span>Jumper XP</span></nav>

    <main>
      <section className="jp-intro" aria-labelledby="jp-heading">
        <div><p className="jp-eyebrow">JUMPER / COMMUNITY TOOLS</p><h1 id="jp-heading">What could your Jumper<br /><span>points be worth?</span></h1><p>Look up your XP and compare estimated values across FDV scenarios.</p></div>
        <span className="jp-status"><i aria-hidden="true" />Public wallet lookup</span>
      </section>

      <JumperScenarios settings={calculation} update={updateCalculation} walletPoints={result?.points ?? null} walletLookup={walletLookup} />
    </main>
    <footer className="jp-footer"><span>Jumper community tools</span><a href="https://jumper.xyz/" target="_blank" rel="noopener noreferrer">jumper.xyz <span aria-hidden="true">↗</span></a></footer>
  </div></div>;
}
