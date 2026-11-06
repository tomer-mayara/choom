import { describe, expect, test } from "bun:test";
import {
  architectureSchema,
  starterArchitecture,
} from "../../src/domain/architecture";
import { layoutArchitecture } from "../../src/lib/layout";

describe("architecture model", () => {
  test("rejects duplicate node identifiers", () => {
    const model = {
      ...starterArchitecture,
      nodes: [...starterArchitecture.nodes, starterArchitecture.nodes[0]],
    };
    expect(architectureSchema.safeParse(model).success).toBe(false);
  });

  test("rejects edges pointing to a missing node", () => {
    const model = {
      ...starterArchitecture,
      edges: [{ id: "broken", source: "ui", target: "missing" }],
    };
    expect(architectureSchema.safeParse(model).success).toBe(false);
  });

  test("rejects duplicate edge identifiers", () => {
    const model = {
      ...starterArchitecture,
      edges: [starterArchitecture.edges[0], starterArchitecture.edges[0]],
    };
    expect(architectureSchema.safeParse(model).success).toBe(false);
  });

  test("lays out every node without overlapping positions", async () => {
    const nodes = await layoutArchitecture(starterArchitecture);
    expect(nodes.map((node) => node.id)).toEqual(
      starterArchitecture.nodes.map((node) => node.id),
    );
    expect(
      new Set(nodes.map(({ position }) => `${position.x}:${position.y}`)).size,
    ).toBe(nodes.length);
    expect(
      nodes.every(
        ({ position }) =>
          Number.isFinite(position.x) && Number.isFinite(position.y),
      ),
    ).toBe(true);
  });
});
