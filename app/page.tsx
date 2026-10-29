import Link from "next/link";
import { redirect } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";
import { projects } from "@/lib/projects";
import { getTheme } from "@/lib/theme";
import { featureFlags } from "@/lib/features";
import "./hub.css";

export const dynamic = "force-dynamic";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ProjectArtwork({ id }: { id: string }) {
  if (id === "bulk") return <div className="hub-cover-art" aria-hidden="true"><svg viewBox="0 0 380 240" fill="none">{[0, 1, 2, 3].map(index => <circle key={index} cx="280" cy="110" r={65 + index * 28} stroke="currentColor" strokeWidth=".7" />)}</svg><img src="/brand/bulk/symbol.svg" alt="" width="200" height="200" /></div>;
  if (id === "entropy") return <div className="hub-cover-art" aria-hidden="true"><svg viewBox="0 0 380 240" fill="none">{[0,1,2,3,4,5,6].map(index=><path key={index} d={`M${index*45-30} 0v240M0 ${index*45-30}h380`} stroke="currentColor" strokeWidth=".5" />)}</svg><img src="/brand/entropy/symbol.svg" alt="" width="200" height="160" /></div>;
  if (id === "variational") return <div className="hub-cover-art" aria-hidden="true"><svg viewBox="0 0 380 240" fill="none">{[0, 1, 2, 3, 4].map(index => <path key={index} d={`M${-60 + index * 27} 270Q${60 + index * 27} -30 ${180 + index * 27} 90T${420 + index * 27} 170`} stroke="currentColor" />)}</svg><img src="/brand/variational/symbol.svg" alt="" width="200" height="200" /></div>;
  if (!["arcus", "txflow", "extended"].includes(id)) return null;
  return <div className="hub-cover-art" aria-hidden="true">
    {id === "arcus" ? <><svg viewBox="0 0 380 240" fill="none">{[0, 1, 2, 3, 4, 5].map(index => <path key={index} d={`M${90 + index * 27} 270V154c0-95 77-172 172-172h150`} stroke="currentColor" strokeWidth="1" />)}</svg><img src="/brand/arcus-symbol.svg" alt="" width="200" height="200" /></>
      : id === "txflow" ? <svg viewBox="0 0 380 240" fill="none"><path d="M130 256v-83h57v-57h57V59h57V2h99" stroke="currentColor" strokeWidth="1" /><path d="M158 256v-55h57v-57h57V87h57V30h71" stroke="currentColor" strokeWidth="1" opacity=".5" /><path d="M215 144h57V87h57V30h57v171H215z" fill="currentColor" opacity=".13" /><path d="M244 59h57V2h57v114H244z" fill="currentColor" opacity=".2" /><rect x="187" y="116" width="57" height="57" fill="currentColor" opacity=".16" /><rect x="329" y="201" width="29" height="29" fill="currentColor" opacity=".5" /></svg>
      : <><svg viewBox="0 0 380 240" fill="none"><path d="M-20 221C70 96 159 27 401 24M-20 251C70 126 159 57 401 54M-20 281C70 156 159 87 401 84M-20 311C70 186 159 117 401 114" stroke="currentColor" strokeWidth="1" /></svg><img src="/brand/extended/symbol.svg" alt="" width="200" height="200" /></>}
  </div>;
}

function ToolIcon({ wallet }: { wallet: boolean }) {
  return wallet ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h14v4H4V6Zm0 4v10h16V10H4Zm11 4h5v3h-5v-3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7h8M8 12h2m4 0h2m-8 4h2m4 0h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

export default async function Page() {
  if (!featureFlags.multiExchange) redirect("/arcus");
  const initialTheme = await getTheme();
  const available = projects.filter(project => project.status === "available").length;

  return <div className="project-hub"><div className="hub-shell">
    <header className="hub-header">
      <Link href="/" className="hub-brand" aria-label="Perp tools — project selection"><span className="hub-symbol" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none"><path d="M4 16v4m8-10v10m8-16v16M3 10l7-5 5 2 6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>Perp tools<span className="hub-brand-dot" aria-hidden="true">.</span></Link>
      <div className="hub-header-actions"><span className="hub-community">Independent. Community built.</span><ThemeToggle initialTheme={initialTheme} /></div>
    </header>
    <main>
      <section className="hub-intro" aria-labelledby="hub-heading">
        <div><p className="hub-eyebrow"><span aria-hidden="true" />POINTS & TRADING ANALYTICS</p><h1 id="hub-heading">Your perp <span>workspace.</span></h1></div>
        <div className="hub-exchange-count" aria-label={`${available} exchanges available`}><span>{String(available).padStart(2, "0")}</span><span>EXCHANGES<br />ONE WORKSPACE</span></div>
      </section>
      <section className="hub-projects" aria-labelledby="projects-heading">
        <div className="hub-list-heading"><h2 id="projects-heading">Choose your exchange</h2><span>YOUR NEXT PERSPECTIVE <Arrow /></span></div>
        <div className="hub-project-grid">{projects.map((project, index) => {
          const live = project.status === "available" && project.href;
          const wordmark = project.id === "arcus" ? "/brand/arcus-logo-cream.svg" : project.id === "txflow" ? "/brand/txflow/logo.svg" : project.id === "extended" ? "/brand/extended/logo.svg" : project.id === "variational" ? "/brand/variational/logo.svg" : project.id === "bulk" ? "/brand/bulk/logo.svg" : null;
          return <article className={`hub-project hub-project-${project.id}`} key={project.id} aria-labelledby={`hub-project-${project.id}`} style={{ animationDelay: `${index * 70}ms` }}>
            <div className="hub-project-cover">
              <ProjectArtwork id={project.id} />
              <div className="hub-project-top"><span>{String(index + 1).padStart(2, "0")} / {project.name.toUpperCase()}</span><span className="hub-project-status"><i aria-hidden="true" />{live ? "Live" : "Soon"}</span></div>
              <h3 id={`hub-project-${project.id}`}>{wordmark ? <><span className="sr-only">{project.name}</span><img src={wordmark} alt="" width="180" height="48" /></> : project.name}</h3>
              {live && <Link className="hub-cover-link" href={project.href!} aria-label={`Open ${project.name} tools`}><span className="hub-cover-arrow"><Arrow diagonal /></span></Link>}
            </div>
            <div className="hub-project-body">
              <ul className="hub-tool-links" aria-label={`${project.name} tools`}>{project.tools.map(tool => <li key={tool}>{live ? <Link href={tool === "Wallet analytics" ? project.walletHref ?? `${project.href}/wallet` : project.href!} aria-label={`${project.name} ${tool}`}><span className="hub-tool-symbol"><ToolIcon wallet={tool === "Wallet analytics"} /></span><span>{tool}</span><Arrow /></Link> : <span className="hub-tool-pending">{tool}</span>}</li>)}</ul>
              <a className="hub-external" href={project.website} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${project.name} exchange (opens in a new tab)`}><span>Visit exchange</span><Arrow diagonal /></a>
            </div>
          </article>;
        })}</div>
      </section>
    </main>
    <footer className="hub-footer"><span>Independent tools. A clearer view.</span><span><i aria-hidden="true">＋</i> More exchanges, soon.</span></footer>
  </div></div>;
}
