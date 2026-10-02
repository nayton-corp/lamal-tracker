"use client";

import { CalendarCheck, Home, LineChart, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

const ITEMS = [
  { href: "/", label: "Accueil", hint: "Vue d'ensemble", Icon: Home },
  { href: "/rituel", label: "Rituel", hint: "Comparer et changer", Icon: CalendarCheck },
  { href: "/foyer", label: "Foyer", hint: "Personnes et contrats", Icon: Users },
  { href: "/historique", label: "Historique", hint: "Primes année après année", Icon: LineChart },
  { href: "/donnees", label: "Réglages", hint: "Primes officielles, caisses", Icon: Settings },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Navigation principale : barre du bas sur téléphone, colonne latérale sur ordinateur. */
export function AppNav() {
  return (
    <>
      <BottomNav />
      <SideNav />
    </>
  );
}

function BottomNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-lg safe-bottom lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted hover:text-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Navigation principale" className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 rounded-xl px-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" width={36} height={36} className="rounded-lg" />
        <span className="leading-tight">
          <span className="block font-bold">Primes LAMal</span>
          <span className="block text-xs text-muted">Assurance de base du foyer</span>
        </span>
      </Link>
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, hint, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                  active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-2",
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
                <span className="leading-tight">
                  <span className="block font-medium">{label}</span>
                  <span className={cn("block text-xs", active ? "text-primary/80" : "text-muted")}>{hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
