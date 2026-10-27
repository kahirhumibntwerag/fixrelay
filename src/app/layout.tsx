import { SiteBreadcrumb, SiteNavigation } from "@/components/site-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Radio } from "lucide-react";
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
              <span className="brand-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" fill="none">
                  <path d="M15 32 25 18 42 16 51 29 41 46 23 47 15 32Zm10-14 8 15 9-17M15 32l18 1 8 13m10-17-18 4-10 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <g fill="currentColor"><circle cx="15" cy="32" r="4"/><circle cx="25" cy="18" r="4"/><circle cx="42" cy="16" r="4"/><circle cx="51" cy="29" r="4"/><circle cx="41" cy="46" r="4"/><circle cx="23" cy="47" r="4"/><circle cx="33" cy="33" r="5"/></g>
                </svg>
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
