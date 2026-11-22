import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { type MappedOwners, type MappingInputs, validateCodeMapping } from "../../src/record-code-mapping.ts";
import { loadTsMorph } from "../../src/ts-morph-modules.ts";

// The code mapping checks of the shared validation on a small run, with a mapping of
// files and parts. The other record checks are replaced by small doubles: a unit
// claims its ID, cites any evidence, and its membership reference names the
// membership statement of a component. billing.ts holds computeInvoice and
// computePrice; a symbol selector of pricing divides it.
type Fields = Record<string, unknown>;
type Range = [{ line: number; column: number }, { line: number; column: number }];
interface Run { files: Record<string, string>; memberships: Record<string, Fields>; units: Fields[]; unitKind?: string }

const billing = ["import { rate } from './rate';", "", "export function computeInvoice(total: number) {",
  "  return total * rate;", "}", "", "/** The price of a number of items. */", "export function computePrice(count: number) {",
  "  return count * 2;", "}", ""].join("\n");
const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const at = (line: number, column: number) => ({ line, column });
const priceRanges: Range[] = [[at(7, 1), at(10, 2)]];
const restRanges: Range[] = [[at(1, 1), at(7, 1)], [at(10, 2), at(11, 1)]];
const membershipRef = (owner: string): string => `proposal#/components/${owner}/membership`;
const selector = (symbol: string, path = "billing.ts") => ({ path, symbol });

function unit(path: string, text: string, fields: Fields): Fields {
  const owner = fields.owner as string | null;
  return { id: `unit-${path}-${String(fields.symbol ?? fields.unitKind)}`, path, sha256: sha256(text), roles: ["source"],
    inspection: "unreviewed", reason: "Reviewed.", membershipRef: owner === null ? null : membershipRef(owner), evidenceRefs: ["launch"],
    ...fields };
}
const fileUnit = (path: string, text: string, owner: string | null) => unit(path, text, { unitKind: "file", owner });
const symbolUnit = (symbol: string, owner: string, ranges: Range[] = priceRanges) =>
  unit("billing.ts", billing, { unitKind: "symbol", symbol, ranges, owner });
const restUnit = (owner: string | null, ranges: Range[] = restRanges) =>
  unit("billing.ts", billing, { unitKind: "rest", ranges, owner, ...(owner === null ? { reason: "no-path-owner" } : {}) });

// billing owns billing.ts by its path, and pricing names computePrice in it.
function dividedRun(): Run {
  return { files: { "cli.ts": "export function start() {}\n", "billing.ts": billing },
    memberships: { cli: { paths: ["cli.ts"] }, billing: { paths: ["billing.ts"] }, pricing: { paths: [], symbols: [selector("computePrice")] } },
    units: [fileUnit("cli.ts", "export function start() {}\n", "cli"), symbolUnit("computePrice", "pricing"), restUnit("billing")] };
}

function inputs(run: Run): MappingInputs {
  const members = new Map(Object.entries(run.memberships).map(([id, value]) => [id, { value, status: "proposed", evidenceRefs: ["launch"] }]));
  const references = new Map([...members].map(([id, statement]) => [membershipRef(id), statement]));
  return {
    mapping: { kind: "code-mapping", limits: ["l"], units: run.units,
      scope: { inventoryRef: "inventory", basis: "all-inventoried-regular-files", unitKind: run.unitKind ?? "file-or-part",
        inspectionMeaning: "Saved ranges.", selectedEntryAnalysisRef: "entry", historicalEntryAnalysisRefs: [] } },
    discovery: { entryAnalysisRef: "entry" }, inventoryRef: "inventory", historyRefs: [], reviewedRanges: [], members,
    indexed: new Map(Object.entries(run.files).map(([path, text]) =>
      [path, { path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }])),
    claim: () => undefined, evidence: () => undefined,
    resolve: (ref) => references.get(ref as string),
    readSource: (path) => Buffer.from(run.files[path] ?? ""),
    divisionTools: () => loadTsMorph().tools,
  };
}

const checked = (change: (run: Run) => void = () => {}): MappedOwners => {
  const run = dividedRun();
  change(run);
  return validateCodeMapping(inputs(run));
};
const expectedUnits = (rest: Fields): string => "The code units of billing.ts differ from the units that its symbol selectors " +
  "give in the saved snapshot. The units must be: " + JSON.stringify([{ unitKind: "symbol", symbol: "computePrice", owner: "pricing",
  ranges: priceRanges }, { unitKind: "rest", ...rest, ranges: restRanges }]);
const billingUnits = (run: Run, units: Fields[]): void => {
  run.units = [run.units[0] as Fields, ...units];
};

describe("validateCodeMapping with a divided file", () => {
  test("accepts a symbol unit for each symbol selector and one rest unit, with the ranges of the syntax tree", () => {
    const mapped = checked();
    expect({ files: mapped.files, pricing: mapped.owns("billing.ts", "pricing"), billing: mapped.owns("billing.ts", "billing"),
      cli: mapped.owns("billing.ts", "cli"), cliFile: mapped.owns("cli.ts", "cli") })
      .toEqual({ files: 2, pricing: true, billing: true, cli: false, cliFile: true });
  });

  // The component check of an inspected path asks who owns code on the lines of a reviewed
  // range. computePrice is on lines 7 to 10; the rest holds lines 1 to 6 and the line break
  // after line 10.
  test("gives the owners of code on the lines of a file: the owner of a file unit, or of a part with a range on the lines", () => {
    const mapped = checked();
    const owners = (path: string, lines: [number, number]): string[] =>
      ["billing", "pricing", "cli"].filter((owner) => mapped.ownsLines(path, lines, owner));
    expect({ price: owners("billing.ts", [8, 9]), setup: owners("billing.ts", [3, 4]), both: owners("billing.ts", [6, 7]),
      sharedLine: owners("billing.ts", [10, 10]), file: owners("cli.ts", [1, 1]) })
      .toEqual({ price: ["pricing"], setup: ["billing"], both: ["billing", "pricing"], sharedLine: ["billing", "pricing"], file: ["cli"] });
  });

  test("accepts a rest with no path owner: no owner, no membership and the reason no-path-owner", () => {
    const mapped = checked((run) => {
      run.memberships.billing = { paths: ["other.ts"] };
      billingUnits(run, [symbolUnit("computePrice", "pricing"), restUnit(null)]);
    });
    expect([mapped.owns("billing.ts", null), mapped.owns("billing.ts", "billing")]).toEqual([true, false]);
  });

  test.each<[string, (run: Run) => void, string]>([
    ["ranges that the syntax tree does not give", (run) => {
      billingUnits(run, [symbolUnit("computePrice", "pricing", [[at(8, 1), at(10, 2)]]), restUnit("billing")]);
    }, expectedUnits({ owner: "billing" })],
    ["a divided file without its rest unit", (run) => billingUnits(run, [symbolUnit("computePrice", "pricing")]),
      expectedUnits({ owner: "billing" })],
    ["a symbol unit with another owner than its selector", (run) => {
      billingUnits(run, [symbolUnit("computePrice", "billing"), restUnit("billing")]);
    }, expectedUnits({ owner: "billing" })],
    ["a rest unit with no owner whose reason is not no-path-owner", (run) => {
      run.memberships.billing = { paths: ["other.ts"] };
      billingUnits(run, [symbolUnit("computePrice", "pricing"), { ...restUnit(null), reason: "Unknown." }]);
    }, expectedUnits({ owner: null, reason: "no-path-owner" })],
    ["a file unit of a divided file", (run) => billingUnits(run, [fileUnit("billing.ts", billing, "billing")]),
      "billing.ts is a file unit, but the symbol selectors of the baseline divide it: computePrice (pricing). Map a divided file " +
      "as its symbol units and its rest unit, in a code mapping with unitKind: file-or-part."],
    ["a mapping of whole files with a divided file", (run) => {
      run.unitKind = "file";
      billingUnits(run, [fileUnit("billing.ts", billing, "billing")]);
    }, "billing.ts is a file unit, but the symbol selectors of the baseline divide it: computePrice (pricing). Map a divided file " +
      "as its symbol units and its rest unit, in a code mapping with unitKind: file-or-part."],
    ["parts of a file that no symbol selector divides", (run) => {
      run.memberships.pricing = { paths: ["pricing.ts"] };
    }, "billing.ts has symbol or rest units, but no symbol selector of the baseline divides it."],
    ["a part with a field that a code unit does not have", (run) => {
      billingUnits(run, [{ ...symbolUnit("computePrice", "pricing"), range: priceRanges[0] }, restUnit("billing")]);
    }, "The symbol unit unit-billing.ts-computePrice of billing.ts must have exactly these fields: id, unitKind, path, sha256, symbol, " +
      "ranges, roles, owner, membershipRef, inspection, reason, evidenceRefs."],
    ["a unit without a known unitKind", (run) => {
      billingUnits(run, [{ ...symbolUnit("computePrice", "pricing"), unitKind: "part" }, restUnit("billing")]);
    }, "The unit unit-billing.ts-computePrice of billing.ts needs unitKind file, symbol or rest."],
    ["an indexed file without a unit", (run) => { run.units = run.units.slice(1); },
      "The code mapping has no unit of the indexed file cli.ts."],
  ])("refuses %s", (_name, change, message) => {
    expect(() => checked(change)).toThrow(new Error(message));
  });
});

describe("validateCodeMapping with a symbol selector that cannot divide its file", () => {
  test.each<[string, (run: Run) => void, string]>([
    ["a name that the file does not declare", (run) => {
      run.memberships.pricing = { paths: [], symbols: [selector("computeTax")] };
    }, "The symbol selector computeTax of billing.ts matched nothing: the file has no top-level declaration with that name."],
    ["a file that is not in the saved inventory", (run) => {
      run.memberships.pricing = { paths: ["billing.ts"], symbols: [selector("computePrice", "missing.ts")] };
      billingUnits(run, [fileUnit("billing.ts", billing, "pricing")]);
      run.memberships.billing = { paths: [] };
    }, "The symbol selector computePrice of missing.ts matched nothing: the file is not in the saved inventory."],
    ["a file that is not JavaScript or TypeScript", (run) => {
      run.files["notes.md"] = "# Notes\n";
      run.units.push(unit("notes.md", "# Notes\n", { unitKind: "rest", ranges: [[at(1, 1), at(2, 1)]], owner: null, reason: "no-path-owner" }));
      run.memberships.pricing = { paths: [], symbols: [selector("computePrice"), selector("notes", "notes.md")] };
    }, "The symbol selectors cannot divide notes.md: the file is not JavaScript or TypeScript."],
  ])("refuses %s", (_name, change, message) => {
    expect(() => checked(change)).toThrow(new Error(message));
  });

  test("refuses a file that is not UTF-8 text", () => {
    const bytes = Buffer.from([...Buffer.from("export const name = '"), 0xff, ...Buffer.from("';\n")]);
    const checks = inputs(dividedRun());
    checks.indexed.set("billing.ts", { path: "billing.ts", kind: "file", bytes: bytes.length, sha256: sha256(bytes) });
    for (const item of checks.mapping.units as Fields[]) if (item.path === "billing.ts") item.sha256 = sha256(bytes);
    checks.readSource = (path) => (path === "billing.ts" ? bytes : Buffer.from("export function start() {}\n"));
    expect(() => validateCodeMapping(checks))
      .toThrow(new Error("The symbol selectors cannot divide billing.ts: the file is not UTF-8 text."));
  });

  test("refuses a file whose saved bytes differ from the inventory digest", () => {
    const checks = inputs(dividedRun());
    checks.readSource = (path) => Buffer.from(path === "billing.ts" ? billing.replace("count * 2", "count * 3") : "export function start() {}\n");
    expect(() => validateCodeMapping(checks)).toThrow(new Error("Changed source file: billing.ts"));
  });

  test("refuses a file larger than 2 MiB", () => {
    const checks = inputs(dividedRun());
    checks.indexed.set("billing.ts", { ...checks.indexed.get("billing.ts"), bytes: 2 * 1024 * 1024 + 1 });
    checks.readSource = () => { throw new Error("The check reads no file over the limit."); };
    expect(() => validateCodeMapping(checks))
      .toThrow(new Error("The symbol selectors cannot divide billing.ts: the file is larger than 2 MiB."));
  });
});

// The caller gives the ts-morph that divides a file, after its own checks, such as
// the pins of the module files of ts-morph that its stage start saved.
describe("the ts-morph that divides a file", () => {
  test("is the ts-morph that the caller gives, loaded once for all divided files", () => {
    const run = dividedRun();
    run.files["copy.ts"] = billing;
    run.units.push(unit("copy.ts", billing, { unitKind: "symbol", symbol: "computePrice", ranges: priceRanges, owner: "pricing" }),
      unit("copy.ts", billing, { unitKind: "rest", ranges: restRanges, owner: null, reason: "no-path-owner" }));
    run.memberships.pricing = { paths: [], symbols: [selector("computePrice"), selector("computePrice", "copy.ts")] };
    let loads = 0;
    const mapped = validateCodeMapping({ ...inputs(run), divisionTools: () => { loads++; return loadTsMorph().tools; } });
    expect([mapped.owns("billing.ts", "pricing"), mapped.owns("copy.ts", "pricing"), loads]).toEqual([true, true, 1]);
  });

  test("is not loaded for a mapping with no divided file", () => {
    const run = dividedRun();
    run.unitKind = "file";
    run.memberships.pricing = { paths: ["pricing.ts"] };
    billingUnits(run, [fileUnit("billing.ts", billing, "billing")]);
    const checks = { ...inputs(run), divisionTools: (): never => { throw new Error("No file needs ts-morph."); } };
    expect(validateCodeMapping(checks).files).toBe(2);
  });

  test("stops the check when the caller refuses its ts-morph", () => {
    const refusal = "Trusted parser module changed since start: ts-morph/dist/ts-morph.js";
    const checks = { ...inputs(dividedRun()), divisionTools: (): never => { throw new Error(refusal); } };
    expect(() => validateCodeMapping(checks)).toThrow(new Error(refusal));
  });
});
