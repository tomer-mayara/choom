const domain = "^src/domain/";
const codec = "^src/lib/architecture-yaml(?:/|\\.ts$)";
const codecContracts = "^src/lib/generated/contracts\\.ts$";
const platform = "^src/platform/";
const platformContracts = "^src/platform/generated/contracts\\.ts$";
const discovery = "^src/architecture/repository-discovery\\.ts$";
const documentLifecycle = "^src/documents/";
const workspaceComposition = "^src/architecture/workspace\\.ts$";
const analyzerComposition = "^src/architecture/create-architectural-layer\\.ts$";
const analyzer = "^src/architecture/dependency-cruiser/";
const application = {
  path: "^src/(architecture|documents)/",
  pathNot: [workspaceComposition, analyzerComposition, analyzer],
};
const view = "^src/architecture/workspace-view\\.ts$";
const workflowContracts = "^src/architecture/generated/workflow\\.ts$";
const workspaceInternals = "^src/(architecture|documents|platform)/";
const retainedImports = { dependencyTypesNot: ["pre-compilation-only"] };

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
      from: { path: domain },
      to: { pathNot: [domain, "^node_modules/zod/"] },
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
      from: { path: platform },
      to: { path: "^src/", pathNot: platform },
    },
    {
      name: "document-codec-is-independent-of-storage-and-analyzers",
      severity: "error",
      from: { path: [codec, codecContracts] },
      to: { pathNot: [codec, codecContracts, domain, "^node_modules/yaml/"] },
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
      from: { path: "^src/", pathNot: platform },
      to: { path: "node_modules/@tauri-apps/" },
    },
    {
      name: "concrete-analyzer-access-through-composition",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: [analyzer, analyzerComposition],
      },
      to: { path: [analyzer, "^node_modules/dependency-cruiser/"] },
    },
    {
      name: "application-does-not-import-ui-or-composition",
      severity: "error",
      from: application,
      to: {
        path: [
          "^src/(App\\.|main\\.|components/|styles\\.css$)",
          "^node_modules/(?!yaml/|zod/)",
          workspaceComposition,
          analyzerComposition,
        ],
      },
    },
    {
      name: "application-does-not-import-runtime-builtins",
      severity: "error",
      from: application,
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "application-architecture-uses-platform-contracts",
      severity: "error",
      from: { path: "^src/architecture/", pathNot: [...application.pathNot, discovery] },
      to: { path: platform, pathNot: platformContracts },
    },
    {
      name: "discovery-uses-repository-access",
      severity: "error",
      from: { path: discovery },
      to: { path: platform, pathNot: [platformContracts, "^src/platform/repository\\.ts$"] },
    },
    {
      name: "document-lifecycle-uses-document-access",
      severity: "error",
      from: { path: documentLifecycle },
      to: { path: platform, pathNot: [platformContracts, "^src/platform/documents\\.ts$"] },
    },
    {
      name: "application-platform-imports-are-erased",
      severity: "error",
      from: application,
      to: { path: platform, ...retainedImports },
    },
    {
      name: "workspace-view-uses-data-bindings",
      severity: "error",
      from: { path: view },
      to: {
        pathNot: [
          workflowContracts,
          "^src/domain/(generated/contracts|readonly-data)\\.ts$",
          "^src/documents/document-files\\.ts$",
          "^src/lib/architecture-layout\\.ts$",
        ],
      },
    },
    {
      name: "workspace-view-imports-are-erased",
      severity: "error",
      from: { path: view },
      to: retainedImports,
    },
    {
      name: "components-use-workspace-view",
      severity: "error",
      from: { path: "^src/components/" },
      to: { path: workspaceInternals, pathNot: [view, workflowContracts] },
    },
    {
      name: "app-uses-workspace-composition",
      severity: "error",
      from: { path: "^src/App\\.tsx$" },
      to: {
        path: workspaceInternals,
        pathNot: [view, workflowContracts, workspaceComposition, "^src/platform/desktop\\.ts$"],
      },
    },
    {
      name: "diagram-renders-prepared-data",
      severity: "error",
      from: { path: "^src/components/architecture-(diagram|details)\\.tsx$" },
      to: { path: "^src/(architecture/|documents/|platform/)" },
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
    // Track whether each import is erased, including inline type imports that retain side effects.
    tsPreCompilationDeps: "specify",
    enhancedResolveOptions: {
      extensions: [".js", ".ts", ".tsx", ".json"],
      conditionNames: ["import", "browser", "default"],
    },
  },
};
