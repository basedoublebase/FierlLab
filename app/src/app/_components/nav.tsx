"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Invullen", match: (p: string) => p === "/" },
  { href: "/wedstrijden", label: "Wedstrijden", match: (p: string) => p.startsWith("/wedstrijden") },
  { href: "/statistieken", label: "Statistieken", match: (p: string) => p.startsWith("/statistieken") },
];

export function AppNav() {
  const pathname = usePathname();

  // Don't show nav on auth pages
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <nav className="app-nav" aria-label="Hoofdnavigatie">
      <div className="app-nav-inner">
        <Link className="app-nav-logo" href="/" aria-label="FierlLab home">
          <img src="/icon.svg" alt="FierlLab" className="app-nav-logo-img" width={28} height={28} />
        </Link>
        <div className="app-nav-links">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`app-nav-link${link.match(pathname) ? " active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/instellingen"
            className={`app-nav-settings${pathname.startsWith("/instellingen") ? " active" : ""}`}
            aria-label="Instellingen"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>
    </nav>
  );
}
