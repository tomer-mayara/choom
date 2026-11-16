import { createHash } from "node:crypto";
import type { ExtraFile } from "../stage-4-publication/fixture.ts";
import { type CodeMapping, membershipRef, type SourceRange, type StageFiveBaseline } from "./fixture.ts";

// A snapshot file that two components can share: billing.ts declares computeInvoice
// and computePrice. A symbol selector of computePrice divides it into two code
// units: the declaration of computePrice with its comment, and the rest of the file.
// The ranges are 1-based lines and columns, from the first character to the
// position after the last one.
export const billingPath = "billing.ts";
export const billingText = [
  "import { rate } from './rate';",
  "",
  "export function computeInvoice(total: number): number {",
  "  return total * rate;",
  "}",
  "",
  "/** The price of a number of items. */",
  "export function computePrice(count: number): number {",
  "  return count * 2;",
  "}",
  "",
].join("\n");
export const billingFile: ExtraFile = { path: billingPath, text: billingText };
export const computePriceRanges: SourceRange[] = [[{ line: 7, column: 1 }, { line: 10, column: 2 }]];
export const billingRestRanges: SourceRange[] = [[{ line: 1, column: 1 }, { line: 7, column: 1 }],
  [{ line: 10, column: 2 }, { line: 11, column: 1 }]];
// The reason of a rest unit whose file no path selector selects.
export const noPathOwner = "no-path-owner";

export interface SymbolPart { symbol: string; owner: string; ranges: SourceRange[] }
export interface RestPart { owner: string | null; ranges: SourceRange[] }

// The text of the file at a list of ranges, in the order of the ranges.
export function textAt(text: string, ranges: readonly SourceRange[]): string {
  const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
  const offset = ({ line, column }: { line: number; column: number }): number => (lineStarts[line - 1] ?? Number.NaN) + column - 1;
  return ranges.map(([start, end]) => text.slice(offset(start), offset(end))).join("");
}

// Replaces the whole-file unit of billing.ts with a symbol unit for each symbol part and a rest unit.
export function divideBilling(mapping: CodeMapping, baseline: StageFiveBaseline, symbols: readonly SymbolPart[], rest: RestPart): void {
  const sha256 = createHash("sha256").update(billingText).digest("hex");
  const shared = { path: billingPath, sha256, roles: ["source"], inspection: "unreviewed", evidenceRefs: ["launch-settings"] };
  const parts = [
    ...symbols.map(({ symbol, owner, ranges }) => ({ ...shared, id: `s5-check-unit-billing-${symbol.toLowerCase()}`,
      unitKind: "symbol", symbol, ranges, owner, membershipRef: membershipRef(baseline, owner),
      reason: `The symbol selector of ${owner} names ${symbol}.` })),
    { ...shared, id: "s5-check-unit-billing-rest", unitKind: "rest", ranges: rest.ranges, owner: rest.owner,
      membershipRef: rest.owner === null ? null : membershipRef(baseline, rest.owner),
      reason: rest.owner === null ? noPathOwner : `The membership paths of ${rest.owner} select the file.` },
  ];
  mapping.scope.unitKind = "file-or-part";
  mapping.units = mapping.units.flatMap((unit) => unit.path === billingPath ? parts : [{ ...unit, unitKind: "file" }]);
}
