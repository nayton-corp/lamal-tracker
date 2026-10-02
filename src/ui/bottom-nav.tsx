"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

const TABS = [
  {
    href: "/",
    label: "Accueil",
    match: (p: string) => p === "/" || p.startsWith("/rituel"),
    icon: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />,
  },
  {
    href: "/foyer",
    label: "Foyer",
    match: (p: string) => p.startsWith("/foyer"),
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6" strokeLinecap="round" />
        <circle cx="17.5" cy="9" r="2.5" />
        <path d="M17 14c2.4.2 4 2 4.5 5" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/comparer",
    label: "Comparer",
    match: (p: string) => p.startsWith("/comparer"),
    icon: <path d="M4 6h10M4 12h16M4 18h7M17 4v4M14 16v4" strokeLinecap="round" />,
  },
  {
    href: "/historique",
    label: "Historique",
    match: (p: string) => p.startsWith("/historique"),
    icon: <path d="M3 20h18M5 16l4-5 4 3 6-8" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
