import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import ReferralOffer from "@/components/referral-offer";

export default function SiteHeader({ initialTheme, season = "Season 1", active = "points" }: { initialTheme: "light" | "dark"; season?: string; active?: "points" | "wallet" }) {
  return <>
    <header className="site-header">
      <Link href="/arcus" className="brand" aria-label="Arcus Points Estimator — home"><img className="brand-logo brand-logo-light" src="/brand/arcus-logo.svg" alt="Arcus" width="134" height="40" /><img className="brand-logo brand-logo-dark" src="/brand/arcus-logo-cream.svg" alt="Arcus" width="134" height="40" /><span className="brand-divider" aria-hidden="true" /><span className="brand-product">{active === "wallet" ? "WALLET ANALYTICS" : "POINTS ESTIMATOR"}</span></Link>
      <div className="header-actions"><ReferralOffer /><span className="season-pill"><span className="status-dot" />{season}</span><ThemeToggle initialTheme={initialTheme} /></div>
    </header>
    <nav className="tool-nav" aria-label="Tools">
      <Link href="/" className="project-switch">← All projects</Link>
      <Link href="/arcus" aria-current={active === "points" ? "page" : undefined}>Points estimator</Link>
      <Link href="/arcus/wallet" aria-current={active === "wallet" ? "page" : undefined}>Wallet analytics</Link>
    </nav>
  </>;
}
