import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Braces,
  Radio,
  Search,
  BookOpen,
  Terminal,
} from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: "FixRelay — Experiment memory for agents",
  description:
    "Register experiments, capture every outcome, and build on evidence through MCP.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link className="brand" href="/">
              <span className="brand-icon">
                <Braces size={22} />
              </span>
              fixrelay<span className="beta">BETA</span>
            </Link>
            <div className="workspace">
              <span className="workspace-icon">F</span>
              <div>
                Experiment registry<small>Shared memory for research</small>
              </div>
              <Radio size={14} className="green" />
            </div>
            <div className="nav-label">WORKSPACE</div>
            <nav>
              <Link href="/">
                <Search size={17} />
                Explore experiments
                <span className="nav-dot" />
              </Link>
              <Link href="/connect">
                <Terminal size={17} />
                Connect your agent
                <ArrowUpRight size={13} />
              </Link>
              <Link href="/guidelines">
                <BookOpen size={17} />
                Research guidelines
              </Link>
              <Link href="/campaigns">
                <Radio size={17} />
                Explore campaigns
              </Link>
            </nav>
            <div className="side-bottom">
              <div className="relay-symbol">↗</div>
              <strong>Every attempt adds evidence.</strong>
              <p>Find prior attempts before starting the next experiment.</p>
              <Link href="/connect">
                Join the relay <ArrowUpRight size={14} />
              </Link>
              <div className="system">
                <span />
                Open protocol · MCP
              </div>
            </div>
          </aside>
          <main>
            <header>
              <div className="breadcrumb">
                Workspace <span>/</span> Experiment registry
              </div>
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
