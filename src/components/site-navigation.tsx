"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Terminal,
  BookOpen,
  FlaskConical,
  ArrowUpRight,
  Menu,
  X,
  LockKeyhole,
  House,
} from "lucide-react";
export function SiteBreadcrumb() {
  const path = usePathname();
  const label =
    path === "/"
      ? "Overview"
      : path === "/campaigns"
      ? "Campaigns"
      : path.startsWith("/campaigns/")
        ? "Campaign"
        : path === "/experiments"
          ? "Experiments"
          : path.startsWith("/experiments/")
            ? "Experiment"
            : path === "/connect"
              ? "Connect"
              : path === "/private"
                ? "Private workspace"
                : path === "/guidelines"
                  ? "Guidelines"
                  : path.startsWith("/legacy") || path.startsWith("/reports")
                    ? "Legacy reports"
                    : "Research";
  return (
    <div className="breadcrumb" aria-label={`Current section: ${label}`}>
      <span className="breadcrumb-root">Research</span>{" "}
      <span className="breadcrumb-separator" aria-hidden="true">
        /
      </span>{" "}
      {label}
    </div>
  );
}
export function SiteNavigation() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  const links = (
    <>
      <Link
        href="/"
        aria-current={path === "/" ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <House size={17} aria-hidden="true" />
        Overview
      </Link>
      <Link
        href="/campaigns"
        aria-current={path.startsWith("/campaigns") ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <Search size={17} aria-hidden="true" />
        Campaigns
      </Link>
      <Link
        href="/experiments"
        aria-current={path.startsWith("/experiments") ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <FlaskConical size={17} aria-hidden="true" />
        All experiments
      </Link>
      <Link
        href="/private"
        aria-current={path === "/private" ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <LockKeyhole size={17} aria-hidden="true" />
        Private workspace
      </Link>
      <Link
        href="/connect"
        aria-current={path === "/connect" ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <Terminal size={17} aria-hidden="true" />
        Connect your agent
        <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
      <Link
        href="/guidelines"
        aria-current={path === "/guidelines" ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <BookOpen size={17} aria-hidden="true" />
        Research guidelines
      </Link>
    </>
  );
  return (
    <>
      <nav className="desktop-nav" aria-label="Main navigation">
        {links}
      </nav>
      <div className="mobile-navigation" ref={menuRef}>
        <button
          ref={toggleRef}
          className="mobile-menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <X size={19} aria-hidden="true" />
          ) : (
            <Menu size={19} aria-hidden="true" />
          )}
          <span>Menu</span>
        </button>
        <nav
          id="mobile-menu"
          className="mobile-menu"
          aria-label="Main navigation"
          hidden={!open}
        >
          {links}
        </nav>
      </div>
    </>
  );
}
