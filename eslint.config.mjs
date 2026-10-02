import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "public/sw.js", "test-results/**", "playwright-report/**", ".e2e/**", "next-env.d.ts"] },
  {
    // Le domaine reste pur : ni framework, ni base, ni Node.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/infrastructure/*", "@/application/*", "@/app/*", "@/server/*", "@/ui/*", "next", "next/*", "react", "drizzle-orm", "drizzle-orm/*", "node:*"], message: "Le domaine doit rester pur." }] },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/app/*", "@/ui/*", "@/server/*", "next", "next/*", "react"], message: "L'application ne dépend pas de l'interface." }] }],
    },
  },
];

export default config;
