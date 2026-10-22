import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import { projects } from "@/lib/projects";
import { getTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialTheme = await getTheme();
  const available = projects.filter(project => project.status === "available").length;

  return <div className="site-shell project-hub">
    <header className="hub-header">
      <Link href="/" className="hub-brand" aria-label="Perp tools — project selection">
        <span className="hub-symbol" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 17V20M12 11V20M20 4V20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M3 10L10 5L15 7L21 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span>Perp tools</span>
      </Link>
      <div className="hub-header-actions"><span>Community analytics</span><ThemeToggle initialTheme={initialTheme} /></div>
    </header>

    <main>
      <section className="hub-intro" aria-labelledby="hub-heading">
        <p className="eyebrow">POINTS · TRADING · PERSPECTIVE</p>
        <h1 id="hub-heading">Choose your <span>exchange.</span></h1>
        <p className="hub-description">A clearer view of your points and trading activity.<br className="hub-desktop-break" /> Pick a project to get started.</p>
      </section>

      <section aria-labelledby="projects-heading" className="hub-projects">
        <div className="hub-list-heading"><h2 id="projects-heading">Explore projects</h2><span><i aria-hidden="true" />{available} live · {projects.length - available} coming soon</span></div>
        <div className="project-grid">{projects.map((project, index) => <article key={project.id} className={`project-card panel project-${project.id}`} aria-labelledby={`project-${project.id}`}>
          <div className="project-card-top"><span className="project-number">{String(index + 1).padStart(2, "0")} / PERPETUALS</span><span className={`project-status ${project.status}`}><i aria-hidden="true" />{project.status === "available" ? "Available" : "Coming soon"}</span></div>
          <div className="project-identity">
            {project.id === "arcus" ? <h3 id={`project-${project.id}`}><span className="sr-only">Arcus</span><img className="brand-logo brand-logo-light" src="/brand/arcus-logo.svg" alt="" width="162" height="49" /><img className="brand-logo brand-logo-dark" src="/brand/arcus-logo-cream.svg" alt="" width="162" height="49" /></h3> : project.id === "txflow" ? <h3 id={`project-${project.id}`}><span className="sr-only">TxFlow</span><img className="brand-logo txflow-logo" src="/brand/txflow/logo.svg" alt="" width="162" height="36" /></h3> : <h3 id={`project-${project.id}`}>{project.name}</h3>}
            <p>{project.description}</p>
          </div>
          <ul className="project-tools" aria-label={`${project.name} ${project.status === "available" ? "tools" : "planned tools"}`}>{project.tools.map(tool => <li key={tool}>{tool}</li>)}</ul>
          <div className="project-card-actions">
            {project.href && project.status === "available" ? <Link className="project-open" href={project.href}>Open {project.name}<span aria-hidden="true">↗</span></Link> : <span className="project-pending">Tools in preparation<span aria-hidden="true">—</span></span>}
            <a className="project-external" href={project.website} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${project.name} exchange (opens in a new tab)`}>Visit exchange <span aria-hidden="true">↗</span></a>
          </div>
        </article>)}</div>
        <p className="hub-more"><span aria-hidden="true">＋</span> More exchanges will join the toolkit.</p>
      </section>
    </main>
    <footer className="site-footer hub-footer"><span>PERP TOOLS · COMMUNITY ANALYTICS</span><span>One place to explore your activity.</span></footer>
  </div>;
}
