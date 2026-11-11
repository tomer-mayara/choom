import { describe, expect, spyOn, test } from "bun:test";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { accepted, baselineExample, fixtureItem, invalidBaseline, proposed, reviewedBaseline } from "../../support/baseline-fixtures.ts";

describe("baseline field shapes", () => {
  test("preserves the four item kinds, statement statuses, and unavailable references", () => {
    const input = baselineExample();
    expect(baselineSchema.safeParse(input).success).toBe(true);
    expect<unknown>(baselineSchema.parse(input)).toEqual(input);
  });

  test.each(["empty", "full"] as const)("accepts the reviewed %s baseline", (example) => {
    const input = reviewedBaseline(example);
    expect(baselineSchema.safeParse(input).success).toBe(true);
    expect<unknown>(baselineSchema.parse(input)).toEqual(input);
  });

  test.each([
    { formatVersion: 2 }, { id: "Bad_ID" }, { parentId: " " }, { viewport: {} },
    { components: undefined }, { interfaces: undefined }, { resources: undefined }, { rules: undefined },
  ])("rejects invalid top-level fields: %j", (change) => {
    expect(baselineSchema.safeParse({ ...baselineExample(), ...change }).success).toBe(false);
  });

  test.each(["components", "interfaces", "resources", "rules"] as const)(
    "rejects missing names, blank names, and extra fields in %s", (kind) => {
      for (const change of [{ name: undefined }, { name: " \n " }, { displayColor: "blue" }]) {
        const input = baselineExample();
        Object.assign(fixtureItem(input[kind]), change);
        expect(baselineSchema.safeParse(input).success).toBe(false);
      }
    },
  );

  test.each([
    null, proposed(null), proposed(" "), { value: "Intent", status: "unknown", evidenceRefs: ["ref"] },
    { value: "Intent", status: "proposed", evidenceRefs: [] },
    { value: "Intent", status: "proposed", evidenceRefs: [" "] },
    { ...proposed("Intent"), acceptanceRef: "review" },
    { ...accepted("Intent"), acceptanceRef: undefined },
    { ...accepted("Intent"), acceptanceRef: " " },
    { ...proposed("Intent"), confidence: 0.5 },
  ])("rejects an invalid required text statement: %j", (purpose) => {
    const input = baselineExample();
    Object.assign(fixtureItem(input.components), { purpose });
    expect(baselineSchema.safeParse(input).success).toBe(false);
  });

  test.each([
    { publicAccess: proposed([]) }, { publicAccess: proposed([" "]) },
    { allowedConsumers: proposed([]) }, { allowedConsumers: proposed(["checkout", "checkout"]) },
    { promises: proposed({ behavior: "Create invoices" }) },
    { promises: proposed({ behavior: "", data: null, errors: null, lifecycle: null }) },
    { promises: proposed({ behavior: null, data: null, errors: null, lifecycle: null, extra: null }) },
  ])("rejects invalid interface values: %j", (change) => {
    const input = baselineExample();
    Object.assign(fixtureItem(input.interfaces), change);
    expect(baselineSchema.safeParse(input).success).toBe(false);
  });

  test("preserves unknown statements, absent parents, and empty rule objects", () => {
    const input = baselineExample();
    Object.assign(fixtureItem(input.interfaces), {
      owner: proposed(null), publicAccess: proposed(null), allowedConsumers: proposed(null), promises: proposed(null),
    });
    Object.assign(fixtureItem(input.resources), { identity: proposed(null), accessRules: accepted(null) });
    Object.assign(fixtureItem(input.components, 1), { parent: proposed(null) });
    const output = baselineSchema.parse(input);
    expect(output).toEqual(input);
    expect(Object.hasOwn(fixtureItem(output.components), "parent")).toBe(false);
  });
});

describe("baseline item references", () => {
  test.each([
    "a duplicate item ID", "a parent ID that does not exist", "an owner ID that does not exist",
    "a consumer ID that does not exist", "a cycle of component parents",
  ])("identifies %s", (problem) => {
    const { input, path } = invalidBaseline(problem);
    const result = baselineSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
  });

  test.each(["components", "interfaces", "resources", "rules"] as const)(
    "rejects duplicate IDs in %s", (kind) => {
      const input = baselineExample();
      Object.assign(input, { [kind]: [fixtureItem(input[kind]), structuredClone(fixtureItem(input[kind]))] });
      expect(baselineSchema.safeParse(input).success).toBe(false);
    },
  );

  test("rejects a resource owner that names an interface", () => {
    const input = baselineExample();
    fixtureItem(input.resources).owner = proposed("invoice-api");
    const result = baselineSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["resources", 0, "owner", "value"]);
  });

  test("rejects a component as its own parent", () => {
    const input = baselineExample();
    fixtureItem(input.components).parent = proposed("checkout");
    expect(baselineSchema.safeParse(input).success).toBe(false);
  });

  test("permits repeated names, multiple roots, and an opaque baseline-version reference", () => {
    const input = baselineExample();
    input.parentId = "prior-model#/baselines/2";
    fixtureItem(input.components, 1).name = fixtureItem(input.components).name;
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test("keeps known consumers when ownership is unknown and permits an owner as a consumer", () => {
    const input = baselineExample();
    fixtureItem(input.interfaces).owner = proposed(null);
    input.interfaces.push({ ...structuredClone(fixtureItem(input.interfaces)), id: "second-api", owner: proposed("checkout") });
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test("keeps unowned records and rules when no components were modeled", () => {
    const input = baselineExample();
    input.components = [];
    fixtureItem(input.interfaces).owner = proposed(null);
    fixtureItem(input.interfaces).allowedConsumers = proposed(null);
    expect(baselineSchema.parse(input)).toEqual(input);
  });
});

describe("baseline membership selectors", () => {
  test("keeps exact paths, subtrees, and exclusions without resolving ownership", () => {
    const input = baselineExample();
    fixtureItem(input.components).membership.value = {
      paths: ["README.md", ".github/workflows/check.yml", "dir with spaces/file.ts", "路径/**"], excludePaths: [],
    };
    fixtureItem(input.components, 1).membership.value = { paths: ["README.md"] };
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test.each([
    "/source", "C:/source", "C:source", "source\\file", "../source", "./source", "source/../file",
    "source//file", "source/", "source/./file", "source/**/*.ts", "source/*.ts", "source/[x].ts",
    "source/?", "source/{x}", "/**", "**", "", " ", "source/\u0000", "source/\nfile",
  ])("rejects unsupported selector %j in either selector list", (selector) => {
    for (const key of ["paths", "excludePaths"] as const) {
      const input = baselineExample();
      fixtureItem(input.components).membership.value[key] = [selector];
      const result = baselineSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((issue) => issue.path.join(".") === `components.0.membership.value.${key}.0`)).toBe(true);
    }
  });

  test.each([{ paths: [] }, { paths: ["source/**"], symbols: ["Order"] }, { paths: ["source/**"], excludePaths: null }])(
    "rejects invalid membership fields: %j", (membership) => {
      const input = baselineExample();
      Object.assign(fixtureItem(input.components), { membership: proposed(membership) });
      expect(baselineSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("uninterpreted baseline rule data", () => {
  test("preserves nested data and reserved keys without changing input", () => {
    const input = baselineExample();
    const data = JSON.parse('{"__proto__":{"permission":true},"constructor":[],"nested":{"__proto__":{"recorded":true},"text":"  intent  ","values":[1,false,null,{}]}}');
    fixtureItem(input.rules).check = accepted(data);
    const original = structuredClone(input);
    const output = baselineSchema.parse(input);
    expect(output).toEqual(original);
    expect(input).toEqual(original);
    expect(Object.hasOwn(fixtureItem(output.rules).check.value ?? {}, "__proto__")).toBe(true);
  });

  test.each([
    ["array root", []], ["string root", "expression"], ["undefined", { nested: undefined }],
    ["NaN", { nested: Number.NaN }], ["infinity", { nested: Number.POSITIVE_INFINITY }],
    ["date", { nested: new Date() }], ["map", { nested: new Map() }],
    ["function", { nested: () => 1 }], ["bigint", { nested: BigInt(1) }],
  ])("rejects values outside JSON object data: %s", (_name, value) => {
      const input = baselineExample();
      Object.assign(fixtureItem(input.rules), { check: proposed(value) });
      expect(baselineSchema.safeParse(input).success).toBe(false);
    },
  );

  test("rejects cyclic rule objects as invalid input", () => {
    const input = baselineExample();
    const value: Record<string, unknown> = {};
    value["self"] = value;
    Object.assign(fixtureItem(input.rules), { check: proposed(value) });
    expect(baselineSchema.safeParse(input).success).toBe(false);
  });
});

describe("rule-data properties", () => {
  test.each([["text", "extra value"], ["function", () => 1]])(
    "rejects array properties containing %s", (_name, extra) => {
      const input = baselineExample();
      const value = { entries: Object.assign([1], { extra }) };
      Object.assign(fixtureItem(input.rules), { check: proposed(value) });
      expect(baselineSchema.safeParse(input).success).toBe(false);
    },
  );

  test.each(["object", "array"])("rejects %s accessors without running them", (kind) => {
    const input = baselineExample();
    let reads = 0;
    const nested = kind === "object" ? {} : [1];
    Object.defineProperty(nested, kind === "object" ? "secret" : "0", {
      enumerable: true,
      get() { reads += 1; return "not recorded data"; },
    });
    Object.assign(fixtureItem(input.rules), { check: proposed({ nested }) });
    expect(baselineSchema.safeParse(input).success).toBe(false);
    expect(reads).toBe(0);
  });

  test("reports a host copy failure as a validation issue", () => {
    const input = baselineExample();
    const clone = spyOn(globalThis, "structuredClone").mockImplementation(() => {
      throw new RangeError("Host clone depth exceeded");
    });
    try {
      const result = baselineSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((issue) => issue.message === "Rule data could not be copied.")).toBe(true);
    } finally {
      clone.mockRestore();
    }
  });
});
