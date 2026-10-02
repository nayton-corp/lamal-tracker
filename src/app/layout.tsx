import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { app } from "@/server/app";
import { BottomNav } from "@/ui/bottom-nav";
import { ServiceWorkerRegister } from "@/ui/sw-register";
import "./globals.css";

// Données personnelles en base locale : tout est rendu à la demande, jamais pré-généré au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "LAMal Tracker", template: "%s · LAMal Tracker" },
  description: "Suivi des primes LAMal du foyer et comparateur annuel",
  applicationName: "LAMal Tracker",
  appleWebApp: { capable: true, title: "LAMal", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const unread = app().system.unreadCount();
  return (
    <html lang="fr-CH" className="h-full antialiased">
      <body className="min-h-full">
        <div className="pt-safe sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-fg">
                ✚
              </span>
              LAMal Tracker
            </Link>
            <div className="flex items-center">
              <Link
                href="/notifications"
                aria-label={unread > 0 ? `Notifications, ${unread} non lues` : "Notifications"}
                className="relative inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19a2 2 0 004 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unread > 0 && (
                  <span className="num absolute right-1.5 top-1.5 min-w-4 rounded-full bg-up px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unread}
                  </span>
                )}
              </Link>
              <Link href="/reglages" aria-label="Réglages" className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path
                    d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
        <main className="mx-auto max-w-xl px-4 pb-28 pt-4">{children}</main>
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
