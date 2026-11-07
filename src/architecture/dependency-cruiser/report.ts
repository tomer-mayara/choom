import { z } from "zod";
import type { AnalysisFailureCode } from "../../domain/generated/contracts.ts";

const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const MAX_MODULES = 10_000;
const MAX_DEPENDENCIES = 50_000;
export const MAX_FINDINGS = 5_000;
const MAX_FINDING_REFERENCES = 50_000;
const MAX_FOLDERS = 10_000;
const MAX_RULES = 5_000;
const encoder = new TextEncoder();

export class ConversionProblem extends Error {
  readonly code: AnalysisFailureCode;
  readonly stage: "conversion" | "validation";

  constructor(code: AnalysisFailureCode, message: string, stage: "conversion" | "validation" = "conversion") {
    super(message);
    this.code = code;
    this.stage = stage;
  }
}

export function boundedText(maxBytes: number) {
  return z.string().min(1).refine((value) => encoder.encode(value).byteLength <= maxBytes && !/[\x00-\x1f\x7f]/u.test(value));
}

const pathText = boundedText(4096);
const tags = z.array(boundedText(128)).max(128);
const classification = { coreModule: z.boolean().optional(), couldNotResolve: z.boolean().optional(), dependencyTypes: tags.optional() };
const dependencySchema = z.object({
  module: pathText,
  resolved: pathText,
  ...classification,
  dependencyTypes: tags,
  typeOnly: z.boolean().optional(),
  dynamic: z.boolean().optional(),
  preCompilationOnly: z.boolean().optional(),
});
const moduleSchema = z.object({
  source: pathText,
  dependencies: z.array(dependencySchema),
  ...classification,
  consolidated: z.boolean().optional(),
});
const miniReference = z.object({ name: pathText, dependencyTypes: tags.optional() });
const metricRecord = z.custom<Record<string, number>>((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 128 && entries.every(([name, metric]) => /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/u.test(name) && typeof metric === "number" && Number.isFinite(metric));
}).transform((value) => Object.fromEntries(Object.entries(value)));
const severity = z.enum(["error", "warn", "info", "ignore"]);
const violationSchema = z.object({
  type: z.enum(["dependency", "module", "cycle", "folder", "instability", "reachability"]).optional(),
  from: pathText,
  to: pathText,
  rule: z.object({ name: boundedText(512), severity }),
  cycle: z.array(miniReference).optional(),
  via: z.array(miniReference).optional(),
  metrics: z.object({ from: metricRecord.optional(), to: metricRecord.optional() }).optional(),
});
const ruleSchema = z.object({ name: boundedText(512).optional(), scope: z.enum(["module", "folder"]).optional() });
const filterPattern = z.string().max(4096).refine((value) => encoder.encode(value).byteLength <= 4096 && !/[\x00-\x1f\x7f]/u.test(value));
const excludeFilter = z.union([filterPattern, z.object({ path: filterPattern.optional(), dynamic: z.boolean().optional() })]);
const doNotFollowFilter = z.union([filterPattern, z.object({ path: filterPattern.optional(), dependencyTypes: tags.optional() })]);
const optionsSchema = z.object({
  baseDir: pathText.optional(),
  outputType: boundedText(128),
  cache: z.unknown().optional(),
  collapse: z.unknown().optional(),
  focus: z.unknown().optional(),
  reaches: z.unknown().optional(),
  includeOnly: filterPattern.optional(),
  exclude: excludeFilter.optional(),
  doNotFollow: doNotFollowFilter.optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  moduleSystems: z.array(z.enum(["cjs", "amd", "es6", "tsd"])).max(128).optional(),
  parser: z.enum(["acorn", "tsc", "swc"]).optional(),
  tsPreCompilationDeps: z.union([z.boolean(), z.literal("specify")]).optional(),
  detectJSDocImports: z.boolean().optional(),
  detectImportsInAmbientModules: z.boolean().optional(),
  combinedDependencies: z.boolean().optional(),
  preserveSymlinks: z.boolean().optional(),
  detectProcessBuiltinModuleCalls: z.boolean().optional(),
  skipAnalysisNotInRules: z.boolean().optional(),
  ignoreKnown: z.boolean().optional(),
  tsConfig: z.unknown().optional(),
  babelConfig: z.unknown().optional(),
});

const reportSchema = z.object({
  modules: z.array(moduleSchema),
  folders: z.array(z.object({ name: pathText, moduleCount: z.number().int().min(-1) })).optional(),
  summary: z.object({
    violations: z.array(violationSchema),
    optionsUsed: optionsSchema,
    environment: z.object({
      version: boundedText(128),
      issues: z.array(z.object({ name: boundedText(128), severity, description: z.string().min(1).max(16_384) })).max(MAX_FINDINGS).optional(),
    }),
    ruleSetUsed: z.object({ forbidden: z.array(ruleSchema).optional(), required: z.array(ruleSchema).optional(), allowed: z.array(ruleSchema).optional() }).optional(),
  }),
});

export type CruiserReport = z.output<typeof reportSchema>;
type CruiserModule = CruiserReport["modules"][number];
export type CruiserDependency = CruiserModule["dependencies"][number];
export type CruiserViolation = CruiserReport["summary"]["violations"][number];
export type CruiserClassification = Pick<CruiserModule, "coreModule" | "couldNotResolve" | "dependencyTypes">;

export function readReport(json: string): CruiserReport {
  if (json.length > MAX_REPORT_BYTES || encoder.encode(json).byteLength > MAX_REPORT_BYTES) throw new ConversionProblem("limit-exceeded", "The completed report exceeds the 16 MiB text limit.");
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ConversionProblem("invalid-observations", "The completed report is not valid JSON."); }
  checkRecordLimits(value);
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) throw new ConversionProblem("invalid-observations", "The completed report does not match the supported dependency-cruiser format.");
  const report = parsed.data;
  for (const module of report.modules) {
    for (const dependency of module.dependencies) {
      for (const [flag, tag] of [["typeOnly", "type-only"], ["preCompilationOnly", "pre-compilation-only"]] as const) {
        if (dependency[flag] === false && dependency.dependencyTypes.includes(tag)) {
          throw new ConversionProblem("invalid-observations", "The completed report contains conflicting import flags.");
        }
      }
    }
  }
  return report;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function checkRecordLimits(value: unknown): void {
  const root = record(value);
  const summary = record(root.summary);
  const rules = record(summary.ruleSetUsed);
  const modules = array(root.modules);
  const violations = array(summary.violations);
  const exceeded = () => { throw new ConversionProblem("limit-exceeded", "The completed report exceeds the supported observation limits."); };
  if (modules.length > MAX_MODULES || array(root.folders).length > MAX_FOLDERS
    || violations.length + array(record(summary.environment).issues).length > MAX_FINDINGS
    || array(rules.forbidden).length + array(rules.required).length + array(rules.allowed).length > MAX_RULES) exceeded();
  if (modules.reduce<number>((count, item) => count + array(record(item).dependencies).length, 0) > MAX_DEPENDENCIES
    || violations.reduce<number>((count, item) => count + array(record(item).cycle).length + array(record(item).via).length, 0) > MAX_FINDING_REFERENCES) exceeded();
}

/** Descriptions are vendor text, not a channel for source, configuration, or host paths. */
export function safeDescription(text: string, maximum = 1024): string {
  const flattened = text
    .replace(/[\x00-\x1f\x7f]/gu, " ")
    .replace(/\b(?:https?|file|data):\S+/giu, "[reference]")
    .replace(/(^|[^A-Za-z0-9_.\/\\-])(?:\/|[A-Za-z]:[\\/]|\\\\)[^\s"'`<>),;\]]*/gu, "$1[path]")
    .replace(/\s+/gu, " ").trim();
  let result = "";
  for (const character of flattened) {
    if (encoder.encode(result + character).byteLength > maximum) break;
    result += character;
  }
  return result || "Analyzer information";
}

export function describeScope(options: CruiserReport["summary"]["optionsUsed"]): string[] {
  const notes: string[] = [];
  for (const key of ["includeOnly", "exclude", "doNotFollow", "maxDepth", "moduleSystems", "parser", "tsPreCompilationDeps", "detectJSDocImports", "detectImportsInAmbientModules", "combinedDependencies", "preserveSymlinks", "detectProcessBuiltinModuleCalls", "skipAnalysisNotInRules", "ignoreKnown"] as const) {
    const value = options[key];
    if (value !== undefined) notes.push(safeDescription(`${key}: ${JSON.stringify(value)}`));
  }
  if (options.tsConfig !== undefined) notes.push("TypeScript configuration was used.");
  if (options.babelConfig !== undefined) notes.push("Babel configuration was used.");
  return notes;
}
