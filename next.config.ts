import type { NextConfig } from "next";

// En-têtes de sécurité minimaux : pas d'inclusion dans une iframe (clickjacking),
// pas de reniflage de type, pas de fuite d'URL vers d'autres origines.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
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
