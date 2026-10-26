"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Terminal,
  BookOpen,
  FlaskConical,
  ArrowUpRight,
} from "lucide-react";
export function SiteNavigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      <Link
        href="/"
        aria-current={
          path === "/" || path.startsWith("/campaigns") ? "page" : undefined
        }
      >
        <Search size={17} />
        Campaigns
      </Link>
      <Link
        href="/connect"
        aria-current={path === "/connect" ? "page" : undefined}
      >
        <Terminal size={17} />
        Connect your agent
        <ArrowUpRight size={13} />
      </Link>
      <Link
        href="/experiments"
        aria-current={path.startsWith("/experiments") ? "page" : undefined}
      >
        <FlaskConical size={17} />
        All experiments
      </Link>
      <Link
        href="/guidelines"
        aria-current={path === "/guidelines" ? "page" : undefined}
      >
        <BookOpen size={17} />
        Research guidelines
      </Link>
    </nav>
  );
}
