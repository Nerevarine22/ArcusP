import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import ReferralOffer from "@/components/referral-offer";

export default function TxflowHeader({ initialTheme, active }: { initialTheme: "light" | "dark"; active: "points" | "wallet" }) {
  return <>
    <header className="tf-header">
      <Link href="/txflow" className="tf-brand" aria-label="TxFlow points estimator">
        <img className="tf-logo" src="/brand/txflow/logo.svg" alt="TxFlow" width="160" height="35" />
        <span className="tf-product">{active === "wallet" ? "WALLET ANALYTICS" : "POINTS ESTIMATOR"}</span>
      </Link>
      <nav aria-label="TxFlow navigation" className="tf-nav">
        <Link href="/" className="tf-back">← All projects</Link>
        <ReferralOffer href="https://app.txflow.com/r/TXATOMS" code="TXATOMS" label="Open TxFlow" className="tf-referral" />
        <ThemeToggle initialTheme={initialTheme} />
      </nav>
    </header>
    <nav className="tf-tool-nav" aria-label="TxFlow tools"><Link href="/txflow" aria-current={active === "points" ? "page" : undefined}>Points estimator</Link><Link href="/txflow/wallet" aria-current={active === "wallet" ? "page" : undefined}>Wallet analytics</Link></nav>
  </>;
}
