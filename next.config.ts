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
  // La base locale de développement (data/) ne doit jamais partir avec le build « standalone ».
  outputFileTracingExcludes: { "*": ["data/**", "tests/**", "deploy/**", "**/*.db", "**/*.db-*"] },
  experimental: {
    // Plus gros envoi accepté : un fichier de primes OFSP complet (≈ 20 Mo, refusé au-delà de 25 Mo).
    // Les deux limites doivent suivre : le proxy (src/proxy.ts) lit le corps avant l'action, et
    // coupe à 10 Mo par défaut. Le mandataire HTTPS accepte 30 Mo (deploy/Caddyfile).
    serverActions: { bodySizeLimit: "25mb" },
    proxyClientMaxBodySize: "25mb",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Le « rituel » s'appelle désormais « bilan » : les liens des anciens e-mails et favoris suivent.
  async redirects() {
    return [
      { source: "/rituel", destination: "/bilan", permanent: true },
      { source: "/rituel/:path*", destination: "/bilan/:path*", permanent: true },
    ];
  },
};

export default config;
