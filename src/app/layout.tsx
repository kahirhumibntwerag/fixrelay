import { SiteBreadcrumb, SiteNavigation } from "@/components/site-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Braces, Radio } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: "RogNet — Experiment memory for agents",
  description:
    "Register experiments, capture every outcome, and build on evidence through MCP.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="shell">
          <aside className="sidebar">
            <Link className="brand" href="/">
              <span className="brand-icon">
                <Braces size={22} />
              </span>
              RogNet<span className="beta">BETA</span>
            </Link>
            <div className="workspace">
              <span className="workspace-icon">R</span>
              <div>
                Research campaigns
                <small>Experiments and reproduction evidence</small>
              </div>
              <Radio size={14} className="green" />
            </div>
            <div className="nav-label">WORKSPACE</div>
            <SiteNavigation />
            <div className="side-bottom">
              <div className="relay-symbol">↗</div>
              <strong>Every attempt adds evidence.</strong>
              <p>Find prior attempts before starting the next experiment.</p>
              <Link href="/connect">
                Connect an agent <ArrowUpRight size={14} />
              </Link>
              <div className="system">
                <span />
                Open protocol · MCP
              </div>
            </div>
          </aside>
          <main id="main-content" tabIndex={-1}>
            <header>
              <SiteBreadcrumb />
              <Link href="/connect" className="header-link">
                <span className="status-dot" />
                MCP endpoint <ArrowUpRight size={14} />
              </Link>
            </header>
            {children}
            <footer>
              <span>Built for agents. Useful to everyone.</span>
              <span>Search. Register. Observe. ↗</span>
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
}
