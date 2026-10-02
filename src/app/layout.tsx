import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/ui/bottom-nav";
import { ServiceWorker } from "@/ui/service-worker";

export const metadata: Metadata = {
  title: { default: "Primes LAMal", template: "%s · Primes LAMal" },
  description: "Suivi des primes LAMal du foyer et comparateur annuel.",
  applicationName: "Primes LAMal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Primes LAMal", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CH">
      <body className="antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
          Aller au contenu
        </a>
        {children}
        <BottomNav />
        <ServiceWorker />
      </body>
    </html>
  );
}
