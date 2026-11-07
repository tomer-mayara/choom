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
        path: "^(src/|node_modules/(react|react-dom|react-markdown|radix-ui|lucide-react|@tauri-apps|@xyflow)/)",
        pathNot: "^src/domain/",
      },
    },
    {
      name: "libraries-do-not-depend-on-ui-or-platform",
      severity: "error",
      from: { path: "^src/lib/" },
      to: { path: "^src/(App\\.|main\\.|components/|platform/)" },
    },
    {
      name: "platform-does-not-depend-on-workspace",
      severity: "error",
      from: { path: "^src/platform/" },
      to: { path: "^src/", pathNot: "^src/platform/" },
    },
    {
      name: "components-do-not-import-app-entrypoints",
      severity: "error",
      from: { path: "^src/components/" },
      to: { path: "^src/(App\\.|main\\.)" },
    },
    {
      name: "desktop-access-through-adapter",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/platform/" },
      to: { path: "node_modules/@tauri-apps/" },
    },
    {
      name: "concrete-analyzer-access-through-composition",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: "^(src/architecture/dependency-cruiser/|src/architecture/create-architectural-layer\\.ts$)",
      },
      to: { path: "^(src/architecture/dependency-cruiser/|node_modules/dependency-cruiser/)" },
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
