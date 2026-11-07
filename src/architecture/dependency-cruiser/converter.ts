import { z } from "zod";
import { buildArchitectureDocument } from "../../domain/build-architecture-document.ts";
import { ComponentCatalog } from "../../domain/component-catalog.ts";
import { directoryPathSchema, filePathSchema } from "../../domain/architecture-paths.ts";
import type { ArchitectureDiagnostic, ArchitectureObservations, DiagnosticReference, ImportVariant } from "../../domain/generated/contracts.ts";
import type { RepositoryAccess } from "../../platform/repository.ts";
import type { DepCruiserConversionRequest } from "./generated/contracts.ts";
import type { ReportConversion } from "./report-conversion.ts";
import { ReportPaths } from "./report-paths.ts";
import { boundedText, ConversionProblem, type CruiserDependency, type CruiserReport, type CruiserViolation, describeScope, MAX_FINDINGS, readReport, safeDescription } from "./report.ts";

const supportedVersion = "18.7.2";
const requestSchema = z.strictObject({
  request: z.strictObject({
    repositorySession: z.string().regex(/^repository-[1-9][0-9]{0,19}$/u).refine((value) => {
      const suffix = value.slice("repository-".length);
      return /^[0-9]+$/u.test(suffix) && BigInt(suffix) <= 18_446_744_073_709_551_615n;
    }),
    components: ComponentCatalog.declarationsSchema.refine((items) => items.length <= 256 && items.every((item) => boundedText(4096).safeParse(item.id).success && boundedText(1024).safeParse(item.name).success && item.name.trim().length > 0)),
    analysis: z.strictObject({
      enforcer: boundedText(128),
      config: filePathSchema.pipe(boundedText(4096)),
      inputs: z.array(directoryPathSchema.pipe(boundedText(4096))).min(1).max(128),
    }),
  }),
  completed: z.strictObject({
    json: z.string().min(1),
    version: boundedText(128),
    workingDirectory: z.literal("."),
    generatedAt: z.iso.datetime({ offset: true }),
  }),
}) satisfies z.ZodType<DepCruiserConversionRequest>;

const severities = { error: "error", warn: "warning", info: "info", ignore: "ignored" } as const;
const requiredTranspilers = new Map([
  ["missing-tsc-transpiler", "TypeScript (tsc)"],
  ["missing-typescript-transpiler", "TypeScript"],
  ["missing-swc-transpiler", "swc"],
  ["missing-babel-transpiler", "Babel"],
]);

/** Converts a completed vendor report; process execution belongs to the desktop runner. */
export class DepCruiserReportConverter implements ReportConversion {
  private readonly pathAccess: Pick<RepositoryAccess, "resolveRepositoryPaths">;

  constructor(pathAccess: Pick<RepositoryAccess, "resolveRepositoryPaths">) {
    this.pathAccess = pathAccess;
  }

  readonly convert: ReportConversion["convert"] = async (input) => {
    try {
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) throw new ConversionProblem("invalid-request", "The completed report needs a valid repository session, declared components, and analysis context.");
      const context = parsed.data;
      const report = readReport(context.completed.json);
      validateSupportedReport(context, report);
      const paths = new ReportPaths(this.pathAccess, context.request.repositorySession);
      await paths.prepare(report);
      const observations = convertObservations(report, paths);
      const root = context.request.components.find(({ id }) => id === ".");
      if (!root) throw new ConversionProblem("invalid-request", "A declared root component is required.");
      try {
        const document = buildArchitectureDocument({
          name: root.name,
          components: context.request.components,
          analysis: { ...context.request.analysis, version: context.completed.version, generatedAt: context.completed.generatedAt, scopeNotes: describeScope(report.summary.optionsUsed) },
          observations,
        });
        return { status: "success", document };
      } catch {
        throw new ConversionProblem("invalid-document", "The converted observations do not form a valid architecture document.", "validation");
      }
    } catch (error) {
      const problem = error instanceof ConversionProblem ? error : new ConversionProblem("invalid-observations", "The completed report could not be converted.");
      return { status: "failure", stage: problem.stage, code: problem.code, message: problem.message };
    }
  };
}

function validateSupportedReport(context: DepCruiserConversionRequest, report: CruiserReport): void {
  if (context.request.analysis.enforcer !== "dependency-cruiser" || context.completed.version !== supportedVersion || report.summary.environment.version !== context.completed.version) {
    throw new ConversionProblem("unsupported", "Conversion requires a completed dependency-cruiser 18.7.2 report with matching version information.");
  }
  const options = report.summary.optionsUsed;
  if (options.outputType !== "json") {
    throw new ConversionProblem("unsupported", "Unsupported output format: dependency-cruiser must produce JSON.");
  }
  if (options.cache !== undefined && options.cache !== false) {
    throw new ConversionProblem("unsupported", "Persistent caching is unsupported; run the analyzer without a cache.");
  }
  for (const option of ["collapse", "focus", "reaches"] as const) {
    const value = options[option];
    if (value !== undefined && value !== false && value !== "" && value !== null) {
      throw new ConversionProblem("unsupported", `The ${option} option is unsupported for complete file observations.`);
    }
  }
  if (report.modules.some(({ consolidated }) => consolidated === true)) {
    throw new ConversionProblem("unsupported", "Consolidated module records are unsupported because each file must retain its identity.");
  }
  for (const issue of report.summary.environment.issues ?? []) {
    const transpiler = requiredTranspilers.get(issue.name);
    if (transpiler) throw new ConversionProblem("unavailable", `The completed analysis did not have the required ${transpiler} transpiler. Install it and run the analysis again.`);
  }
}

function importFlags(dependency: CruiserDependency): ImportVariant {
  const typeOnly = dependency.typeOnly ?? (dependency.dependencyTypes.includes("type-only") ? true : undefined);
  const preCompilationOnly = dependency.preCompilationOnly ?? (dependency.dependencyTypes.includes("pre-compilation-only") ? true : undefined);
  return {
    ...(typeOnly === undefined ? {} : { typeOnly }),
    ...(dependency.dynamic === undefined ? {} : { dynamic: dependency.dynamic }),
    ...(preCompilationOnly === undefined ? {} : { preCompilationOnly }),
  };
}

function convertObservations(report: CruiserReport, paths: ReportPaths): ArchitectureObservations {
  const observations: ArchitectureObservations = { files: [], imports: [], diagnostics: [] };
  for (const module of report.modules) {
    const source = paths.module(module.source);
    if (source.kind === "file") observations.files.push(source.value);
    for (const dependency of module.dependencies) {
      const target = paths.module(dependency.resolved);
      if (source.kind === "file" && target.kind === "file") observations.imports.push({ sourceFile: source.value, targetFile: target.value, ...importFlags(dependency) });
      if (target.kind === "unresolved") {
        observations.diagnostics.push({
          code: "unresolved-import", severity: "warning", message: "An import could not be resolved.",
          subjects: [{ role: "source", ...source }, { role: "target", ...target }],
        });
      }
    }
  }
  const scopes = ruleScopes(report);
  for (const violation of report.summary.violations) observations.diagnostics.push(convertViolation(violation, scopes, paths));
  for (const issue of report.summary.environment.issues ?? []) {
    observations.diagnostics.push({ code: "analyzer-environment", severity: severities[issue.severity], message: safeDescription(issue.description), subjects: [] });
  }
  if (observations.diagnostics.length > MAX_FINDINGS) throw new ConversionProblem("limit-exceeded", "The completed report exceeds the diagnostic limit.");
  return observations;
}

type RuleScopes = ReadonlyMap<string, "module" | "folder" | null>;

function ruleScopes(report: CruiserReport): RuleScopes {
  const scopes = new Map<string, "module" | "folder" | null>();
  const rules = report.summary.ruleSetUsed;
  for (const rule of [...(rules?.forbidden ?? []), ...(rules?.required ?? [])]) {
    if (rule.name === undefined) continue;
    const scope = rule.scope ?? "module";
    scopes.set(rule.name, scopes.has(rule.name) && scopes.get(rule.name) !== scope ? null : scope);
  }
  return scopes;
}

function findingScope(violation: CruiserViolation, scopes: RuleScopes): "module" | "folder" {
  if (violation.type === "folder") return "folder";
  if (violation.type !== "cycle" && violation.type !== "instability") return "module";
  const scope = scopes.get(violation.rule.name);
  if (scope === null || scope === undefined) throw new ConversionProblem("invalid-observations", "A cycle or instability finding needs one matching rule scope.");
  return scope;
}

function convertViolation(violation: CruiserViolation, scopes: RuleScopes, paths: ReportPaths): ArchitectureDiagnostic {
  const type = violation.type ?? "dependency";
  const scope = findingScope(violation, scopes);
  const reference = (name: string): DiagnosticReference => scope === "folder" ? paths.folder(name) : paths.module(name);
  if (type === "module" && violation.from !== violation.to) throw new ConversionProblem("invalid-observations", "A module finding must identify one subject.");
  const subjects: ArchitectureDiagnostic["subjects"] = type === "module"
    ? [{ role: "subject", ...reference(violation.from) }]
    : [{ role: "source", ...reference(violation.from) }, { role: "target", ...reference(violation.to) }];
  const metrics: Array<[string, number]> = [];
  for (const [side, role] of [["from", "source"], ["to", "target"]] as const) {
    for (const [name, value] of Object.entries(violation.metrics?.[side] ?? {})) metrics.push([`${role}.${name}`, value]);
  }
  return {
    code: `${scope === "folder" && type !== "folder" ? "folder-" : ""}${type}`,
    severity: severities[violation.rule.severity],
    message: `The '${safeDescription(violation.rule.name, 512)}' rule reports a ${type} finding.`,
    rule: safeDescription(violation.rule.name, 512),
    subjects,
    ...(violation.cycle === undefined ? {} : { cycle: violation.cycle.map(({ name }) => reference(name)) }),
    ...(violation.via === undefined ? {} : { via: violation.via.map(({ name }) => reference(name)) }),
    ...(violation.metrics === undefined ? {} : { metrics: Object.fromEntries(metrics) }),
  };
}
