module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "domain-is-platform-independent",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: "^(src/(components|lib|platform)/|node_modules/(react|react-dom|@tauri-apps|@xyflow)/)",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "desktop-access-through-adapter",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/platform/" },
      to: { path: "node_modules/@tauri-apps/" },
    },
    {
      name: "no-test-code-in-app",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^test/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".js", ".ts", ".tsx", ".json"],
      conditionNames: ["import", "browser", "default"],
    },
  },
};
