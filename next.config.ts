import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "exceljs", "@react-pdf/renderer", "web-push"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "40mb" },
  },
};

export default config;
