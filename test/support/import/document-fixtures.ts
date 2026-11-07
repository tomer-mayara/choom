import assert from "node:assert/strict";
import { stringify } from "yaml";
import { objects, type ImportFixture } from "./fixtures.ts";

export function corruptDocument(fixture: ImportFixture, defect: string): void {
  const components = objects(fixture.document.components);
  const relationships = objects(fixture.document.relationships);
  const first = components[0];
  const second = components[1];
  const edge = relationships[0];
  assert.ok(first && second && edge);
  switch (defect) {
    case "two components with the same ID": second.id = first.id; break;
    case "two components with the same name": second.name = first.name; break;
    case "no root component": fixture.document.components = components.slice(1); break;
    case "a parent that is not a component": second.parent = "missing"; break;
    case "a cycle of parent references": second.parent = second.id; break;
    case "an import to an unknown component": edge.target = "missing"; break;
    case "an import from a component to itself": edge.target = edge.source; break;
    case "two relationships for the same ordered pair": fixture.document.relationships = [edge, { ...edge, id: "duplicate-pair" }]; break;
    case "evidence owned by a different source": {
      const evidence = objects(edge.evidence)[0];
      assert.ok(evidence);
      evidence.sourceFile = "packages/core/model/entity.ts";
      break;
    }
    case "a negative reported-file count": second.reportedFiles = -1; break;
    case "a fractional reported-file count": second.reportedFiles = 0.5; break;
  }
}

export function corruptEncoding(fixture: ImportFixture, content: string): void {
  const valid = stringify(fixture.document);
  switch (content) {
    case "schemaVersion 2": fixture.document.schemaVersion = 2; break;
    case "duplicate mapping keys": fixture.savedText = `${valid}\nname: Duplicate\n`; break;
    case "a custom YAML tag": fixture.savedText = valid.replace("name: Atlas", "name: !unsupported Atlas"); break;
    case "two YAML documents": fixture.savedText = `${valid}\n---\n${valid}`; break;
    case "an unknown semantic field": fixture.document.unknownSemanticField = true; break;
  }
}
