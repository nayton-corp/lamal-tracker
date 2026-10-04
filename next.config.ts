import type { NextConfig } from "next";

// En-têtes de sécurité de toutes les réponses : pas d'inclusion dans une iframe (clickjacking),
// pas de reniflage de type, pas de fuite d'URL vers d'autres origines, fenêtre isolée, aucun accès
// aux capteurs. La politique de contenu complète (scripts à nonce) est posée par src/proxy.ts sur
// les pages ; HSTS par le mandataire HTTPS (deploy/Caddyfile).
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "exceljs", "@react-pdf/renderer", "web-push", "unpdf"],
  poweredByHeader: false,
  experimental: {
    // Un fichier de primes OFSP complet pèse ≈ 20 Mo ; la police importée est limitée à 20 Mo.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default config;
