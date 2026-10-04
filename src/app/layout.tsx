import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getHouseholdMode } from "@/application/household";
import { db } from "@/server/context";
import { currentScope } from "@/server/auth";
import { AppNav } from "@/ui/app-nav";
import { ServiceWorker } from "@/ui/service-worker";

export const metadata: Metadata = {
  title: { default: "Primes LAMal", template: "%s · Primes LAMal" },
  description: "Suivez les primes d'assurance maladie de votre foyer et changez de caisse chaque automne sans y passer une soirée.",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const scope = await currentScope();
  const solo = scope !== null && getHouseholdMode(db(), scope) === "SOLO";
  // Sans session (présentation, pages légales, connexion) : ni navigation ni marge pour elle.
  const signedIn = scope !== null;
  return (
    <html lang="fr-CH">
      <body className="antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
          Aller au contenu
        </a>
        <div className={signedIn ? "lg:pl-64" : undefined}>{children}</div>
        {signedIn && <AppNav solo={solo} />}
        <ServiceWorker />
      </body>
    </html>
  );
}
