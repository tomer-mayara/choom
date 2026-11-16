import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Helpers for tests of the producer code record that Stage 1 start saves and
// of the check that every later stage action makes.
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export const missingRecordMessage =
  "This run has no record of the producer code that started it (evidence/producer.json). Start a new run.\n";

// Changes one file in the baseline-model code of a copied tool checkout.
export function changeBaselineModelCode(tools: string): void {
  appendFileSync(join(tools, "packages/baseline-model/src/baseline.ts"), "// A later change.\n");
}

// The refusal for a run whose producer code changed, with the commit and digest that the run recorded.
export function changedCodeMessage(work: string): string {
  const record = JSON.parse(readFileSync(join(work, "evidence/producer.json"), "utf8")) as Record<string, string>;
  return "The producer code changed after this run started. " +
    `This run recorded commit ${record.commit} and code digest ${record.codeDigest}. ` +
    "Continue the run with that producer version, or start a new run.\n";
}

// Every folder and file digest below a folder, so a refused action can show that it changed nothing.
export function folderState(root: string, prefix = ""): [string, string][] {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((first, second) => Buffer.compare(Buffer.from(first.name), Buffer.from(second.name)));
  return entries.flatMap((entry): [string, string][] => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return [[path, "folder"], ...folderState(root, path)];
    return [[path, sha256(readFileSync(join(root, path)))]];
  });
}
