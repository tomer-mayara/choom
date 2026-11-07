import type { ArchitectureDiagnostic, ArchitectureDocument, ImportVariant } from "./generated/contracts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function importVariantKey(variant: ImportVariant): string {
  return [variant.typeOnly, variant.dynamic, variant.preCompilationOnly]
    .map((flag) => flag === undefined ? "0" : flag ? "2" : "1").join("");
}

export function importVariant(variant: ImportVariant): ImportVariant {
  return {
    ...(variant.typeOnly === undefined ? {} : { typeOnly: variant.typeOnly }),
    ...(variant.dynamic === undefined ? {} : { dynamic: variant.dynamic }),
    ...(variant.preCompilationOnly === undefined ? {} : { preCompilationOnly: variant.preCompilationOnly }),
  };
}

export function filePairKey(sourceFile: string, targetFile: string): string {
  return JSON.stringify([sourceFile, targetFile]);
}

function canonicalDiagnostic(diagnostic: ArchitectureDiagnostic): ArchitectureDiagnostic {
  const { metrics, ...rest } = diagnostic;
  return {
    ...rest,
    subjects: [...diagnostic.subjects].sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right))),
    ...(metrics === undefined ? {} : {
      metrics: Object.fromEntries(Object.entries(metrics).sort(([left], [right]) => compareText(left, right))),
    }),
  };
}

export function canonicalArchitectureDocument(document: ArchitectureDocument): ArchitectureDocument {
  return {
    ...document,
    analysis: {
      ...document.analysis,
      inputs: [...document.analysis.inputs].sort(compareText),
      scopeNotes: [...document.analysis.scopeNotes].sort(compareText),
    },
    components: [...document.components].sort((left, right) => compareText(left.id, right.id)),
    relationships: document.relationships.map((relationship) => ({
      ...relationship,
      evidence: relationship.evidence.map((evidence) => ({
        ...evidence,
        variants: evidence.variants.map(importVariant).sort((left, right) => compareText(importVariantKey(left), importVariantKey(right))),
      })).sort((left, right) => compareText(left.sourceFile, right.sourceFile) || compareText(left.targetFile, right.targetFile)),
    })).sort((left, right) => compareText(left.source, right.source) || compareText(left.target, right.target)),
    diagnostics: document.diagnostics.map(canonicalDiagnostic).sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right))),
  };
}
