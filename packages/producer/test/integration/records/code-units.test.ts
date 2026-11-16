import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { checkBaselineDocument, validateBaseline } from "../../../src/record-baseline.ts";
import { type MappedOwners, validateCodeMapping } from "../../../src/record-code-mapping.ts";
import { loadTsMorph } from "../../../src/ts-morph-modules.ts";

// The producer profile of a version 5 baseline and the code mapping of the files that
// its symbol selectors divide. The checks run the shared baseline rules of
// @choom/baseline-model, so this is an integration suite. The other record checks
// are small doubles: a record claims its ID and cites any evidence.
type Fields = Record<string, unknown>;
interface Membership { paths: string[]; symbols?: { path: string; symbol: string }[] }

const billing = "export function computeInvoice(total: number) {\n  return total;\n}\n\n" +
  "/** The price. */\nexport function computePrice(count: number) {\n  return count * 2;\n}\n";
const sha256 = createHash("sha256").update(billing).digest("hex");
const proposed = (value: unknown): Fields => ({ value, status: "proposed", evidenceRefs: ["launch"] });
const component = (id: string, membership: Membership): Fields => ({ id, name: id, purpose: proposed(`Own the ${id} code.`),
  membership: proposed(membership), groupingReason: proposed("Reviewed source.") });
const computePrice = { path: "src/billing.ts", symbol: "computePrice" };

// A version 5 baseline: billing owns src/billing.ts by its path, and pricing names computePrice in it.
function baseline(pricing: Membership = { paths: [], symbols: [computePrice] }, billingSymbols: Membership["symbols"] = []): Fields {
  return { formatVersion: 5, id: "base-1", parentId: null, interfaces: [], resources: [], rules: [],
    components: [component("billing", { paths: ["src/billing.ts"], symbols: billingSymbols }), component("pricing", pricing)] };
}

describe("the producer profile of a version 5 baseline", () => {
  test("accepts a component that owns only symbols", () => {
    expect(checkBaselineDocument(baseline()).components.map((item) => item.id)).toEqual(["billing", "pricing"]);
  });

  test("accepts one symbol name in two files with two owners", () => {
    const pricing = { paths: [], symbols: [{ path: "src/pricing.ts", symbol: "computePrice" }] };
    expect(() => checkBaselineDocument(baseline(pricing, [computePrice]))).not.toThrow();
  });

  test.each<[string, Fields, string]>([
    ["a component with no paths and no symbols", baseline({ paths: [], symbols: [] }),
      "Component pricing has no membership paths or symbols. The producer needs at least one path or symbol for each component."],
    ["two components that name one symbol", baseline(undefined, [computePrice]),
      "The symbol computePrice of src/billing.ts has two owners: billing and pricing. A symbol has one direct owner."],
    ["a version 6 baseline", { ...baseline(), formatVersion: 6 }, "The producer writes baseline formatVersion 1, 2, 3, 4 or 5, not 6."],
  ])("refuses %s", (_name, value, message) => {
    expect(() => checkBaselineDocument(value)).toThrow(new Error(message));
  });
});

// The checked code mapping of src/billing.ts, which the symbol selector of pricing divides.
function mapped(billingUnits: Fields[]): MappedOwners {
  const checked = checkBaselineDocument(baseline());
  const { members } = validateBaseline({ baseline: checked, discovery: { questions: [], gaps: [] },
    claim: () => undefined, evidence: () => undefined });
  const shared = { path: "src/billing.ts", sha256, roles: ["source"], inspection: "unreviewed", evidenceRefs: ["launch"] };
  const units = billingUnits.map((unit) => ({ ...shared, membershipRef: `proposal#/${String(unit.owner)}`, reason: "Reviewed.", ...unit }));
  const references = new Map([...members].map(([id, statement]) => [`proposal#/${String(id)}`, statement]));
  return validateCodeMapping({ discovery: { entryAnalysisRef: "entry" }, inventoryRef: "inventory", historyRefs: [], reviewedRanges: [],
    mapping: { kind: "code-mapping", limits: ["l"], units, scope: { inventoryRef: "inventory", basis: "all-inventoried-regular-files",
      unitKind: "file-or-part", inspectionMeaning: "Saved ranges.", selectedEntryAnalysisRef: "entry", historicalEntryAnalysisRefs: [] } },
    indexed: new Map([["src/billing.ts", { path: "src/billing.ts", kind: "file", bytes: Buffer.byteLength(billing), sha256 }]]),
    members, claim: () => undefined, evidence: () => undefined, resolve: (ref) => references.get(ref as string),
    readSource: () => Buffer.from(billing), divisionTools: () => loadTsMorph().tools });
}

const at = (line: number, column: number) => ({ line, column });

describe("a divided file in the code mapping of a version 5 baseline", () => {
  test("gives the symbol to the component of its selector and the rest to the path owner", () => {
    const owners = mapped([
      { id: "unit-price", unitKind: "symbol", symbol: "computePrice", ranges: [[at(5, 1), at(8, 2)]], owner: "pricing" },
      { id: "unit-rest", unitKind: "rest", ranges: [[at(1, 1), at(5, 1)], [at(8, 2), at(9, 1)]], owner: "billing" }]);
    expect([owners.owns("src/billing.ts", "pricing"), owners.owns("src/billing.ts", "billing"), owners.files]).toEqual([true, true, 1]);
  });

  test("refuses a file that is a file unit and is divided", () => {
    expect(() => mapped([{ id: "unit-file", unitKind: "file", owner: "billing" }])).toThrow(new Error("src/billing.ts is a file " +
      "unit, but the symbol selectors of the baseline divide it: computePrice (pricing). Map a divided file as its symbol units " +
      "and its rest unit, in a code mapping with unitKind: file-or-part."));
  });
});
