import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer", "web-push"],
  // Les migrations SQL doivent être copiées avec le serveur autonome.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  experimental: {
    // Le proxy (authentification optionnelle) met le corps en mémoire : les fichiers OFSP peuvent être gros.
    proxyClientMaxBodySize: "200mb",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
