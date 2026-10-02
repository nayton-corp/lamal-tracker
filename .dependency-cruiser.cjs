/**
 * Règles d'architecture (Clean Architecture) :
 * domaine pur ← application ← infrastructure / interface.
 */
module.exports = {
  forbidden: [
    {
      name: "domaine-pur",
      comment: "Le domaine ne dépend que de lui-même (aucune base, aucun framework, aucun accès réseau).",
      severity: "error",
      from: { path: "^src/domain" },
      to: { pathNot: "^src/domain", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "domaine-sans-node",
      severity: "error",
      from: { path: "^src/domain" },
      to: { dependencyTypes: ["core", "npm"] },
    },
    {
      name: "application-sans-interface",
      comment: "L'application ne connaît ni les pages, ni les composants, ni le serveur.",
      severity: "error",
      from: { path: "^src/application" },
      to: { path: "^src/(app|ui|server)/" },
    },
    {
      name: "interface-sans-base",
      comment: "Les composants passent par l'application ou par les props, jamais par la base.",
      severity: "error",
      from: { path: "^src/ui" },
      to: { path: "^src/infrastructure" },
    },
    {
      name: "infrastructure-sans-interface",
      severity: "error",
      from: { path: "^src/infrastructure" },
      to: { path: "^src/(app|ui|server)/" },
    },
    { name: "pas-de-cycle", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.next" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"] },
  },
};
