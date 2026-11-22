const domain = "^src/domain/";
const baselineModel = "^packages/baseline-model/src/";
const producer = "^packages/producer/src/";
// The duplication helpers read baselines and reports with the viewer's YAML codecs
// and duplication key, as they did before the producer moved out of docs/. Only
// these two files may import only these four app modules until a later ticket
// moves the shared rules into packages.
const producerDuplicationHelpers = "^packages/producer/src/duplication-(commands|files)\\.mjs$";
const producerDuplicationAppImports = [
  "^src/lib/baseline-yaml\\.ts$",
  "^src/lib/architecture-yaml/parse\\.ts$",
  "^src/lib/interface-duplication-yaml\\.ts$",
  "^src/domain/interface-duplication\\.ts$",
];
const codec = "^src/lib/((baseline|interface-duplication|discovery-result)-yaml\\.ts$|architecture-yaml/)";
const codecContracts = "^src/lib/generated/contracts\\.ts$";
const platform = "^src/platform/";
const platformContracts = "^src/platform/generated/contracts\\.ts$";
const workspaceComposition = "^src/architecture/workspace\\.ts$";
const application = {
  path: "^src/architecture/",
  pathNot: [workspaceComposition],
};
const view = "^src/architecture/workspace-view\\.ts$";
const workflowContracts = "^src/architecture/generated/workflow\\.ts$";
const workspaceInternals = "^src/(architecture|platform)/";
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
      to: { pathNot: [domain, baselineModel, "^node_modules/zod/"] },
    },
    {
      name: "baseline-model-imports-no-app-code",
      severity: "error",
      from: { path: "^packages/baseline-model/" },
      to: { path: "^src/" },
    },
    {
      name: "baseline-model-is-platform-independent",
      severity: "error",
      from: { path: baselineModel },
      to: { pathNot: [baselineModel, "^node_modules/zod/", "^src/"] },
    },
    {
      name: "producer-imports-no-app-code",
      severity: "error",
      from: { path: producer, pathNot: producerDuplicationHelpers },
      to: { path: "^src/" },
    },
    {
      name: "producer-duplication-helpers-use-fixed-app-modules",
      severity: "error",
      from: { path: producerDuplicationHelpers },
      to: { path: "^src/", pathNot: producerDuplicationAppImports },
    },
    {
      // The subject check has one rule for each question and gap in every stage (DB1).
      name: "producer-subject-check-uses-no-stage-module",
      severity: "error",
      from: { path: "^packages/producer/src/record-subjects\\.ts$" },
      to: { path: "^packages/producer/src/(stage-[0-9]|candidate-gaps\\.ts$)" },
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
      name: "baseline-codec-uses-domain-and-yaml",
      severity: "error",
      from: { path: [codec, codecContracts] },
      to: { pathNot: [codec, codecContracts, domain, baselineModel, "^node_modules/yaml/"] },
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
      name: "development-analyzers-stay-out-of-app",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^node_modules/(dependency-cruiser|ts-morph|jscpd)[/-]" },
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
      from: application,
      to: { path: platform, pathNot: platformContracts },
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
          "^src/domain/generated/contracts\\.ts$",
          "^packages/baseline-model/src/(generated/contracts|readonly-data)\\.ts$",
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
      to: { path: "^src/(architecture/|platform/)" },
    },
    {
      name: "layout-engine-loads-through-composition",
      severity: "error",
      from: {
        path: ["^src/architecture/", "^src/components/architecture-(diagram|details)\\.tsx$"],
        pathNot: workspaceComposition,
      },
      to: { path: ["^src/lib/architecture-layout\\.ts$", "^node_modules/elkjs/"], ...retainedImports },
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
      // Resolve package exports as TypeScript, Vite, and Node do, including workspace subpaths.
      exportsFields: ["exports"],
      conditionNames: ["import", "browser", "default"],
    },
  },
};
