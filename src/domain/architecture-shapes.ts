import { z } from "zod";
import { directoryPathSchema, filePathSchema, isCanonicalRepositoryPath } from "./architecture-paths.ts";
import { ComponentCatalog } from "./component-catalog.ts";
import { semanticMessages } from "./semantic-validation-messages.ts";
import type {
  AnalysisProvenance, ArchitectureComponent, ArchitectureDiagnostic,
  DiagnosticReference, ImportVariant,
} from "./generated/contracts";

const text = z.string().min(1);
export const architectureComponentsSchema = z.array(ComponentCatalog.declarationSchema.extend({
  reportedFiles: z.number({ error: semanticMessages.nonfiniteFileCount })
    .int({ error: semanticMessages.fractionalFileCount })
    .nonnegative({ error: semanticMessages.negativeFileCount })
    .max(Number.MAX_SAFE_INTEGER, { error: semanticMessages.excessiveFileCount }),
}) satisfies z.ZodType<ArchitectureComponent>).min(1)
  .superRefine((components, context) => new ComponentCatalog(components).validate(context));

export const analysisProvenanceSchema = z.strictObject({
  enforcer: text,
  version: text,
  config: filePathSchema,
  inputs: z.array(directoryPathSchema).min(1),
  generatedAt: z.iso.datetime({ offset: true }),
  scopeNotes: z.array(z.string()),
}) satisfies z.ZodType<AnalysisProvenance>;

export const importVariantSchema = z.strictObject({
  typeOnly: z.boolean().optional(),
  dynamic: z.boolean().optional(),
  preCompilationOnly: z.boolean().optional(),
}) satisfies z.ZodType<ImportVariant>;

const diagnosticReferenceFields = {
  kind: z.enum(["file", "folder", "package", "builtin", "unresolved", "outside-root"]),
  value: text,
};

function validateDiagnosticReference(reference: DiagnosticReference, context: z.RefinementCtx): void {
  const local = reference.kind === "file" || reference.kind === "folder";
  if (local && !isCanonicalRepositoryPath(reference.value, reference.kind === "folder")) {
    context.addIssue({ code: "custom", path: ["value"], message: semanticMessages.noncanonicalDiagnosticPath });
  }
  if (reference.kind === "outside-root" && /^(?:[A-Za-z]:|[/\\])/.test(reference.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: semanticMessages.absoluteOutsideRootReference });
  }
}

const diagnosticReferenceSchema = z.strictObject(diagnosticReferenceFields).superRefine(validateDiagnosticReference);
const diagnosticSubjectSchema = z.strictObject({
  role: z.enum(["source", "target", "subject"]),
  ...diagnosticReferenceFields,
}).superRefine(validateDiagnosticReference);

function isFiniteMetricRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.values(value).every((metric) => typeof metric === "number" && Number.isFinite(metric));
}

// The record contract permits keys such as '__proto__'; keep them as own data properties.
const diagnosticMetricsSchema = z.custom<Record<string, number>>(isFiniteMetricRecord, {
  message: semanticMessages.invalidDiagnosticMetrics,
}).transform((metrics) => Object.fromEntries(Object.entries(metrics)));

export const architectureDiagnosticSchema = z.strictObject({
  code: text,
  severity: z.enum(["ignored", "info", "warning", "error"]),
  message: text,
  rule: text.optional(),
  subjects: z.array(diagnosticSubjectSchema),
  cycle: z.array(diagnosticReferenceSchema).optional(),
  via: z.array(diagnosticReferenceSchema).optional(),
  metrics: diagnosticMetricsSchema.optional(),
}) satisfies z.ZodType<ArchitectureDiagnostic>;
