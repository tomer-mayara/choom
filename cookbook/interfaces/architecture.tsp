import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Domain;

model ArchitectureNode {
  @minLength(1)
  id: string;

  @minLength(1)
  label: string;
}

model ArchitectureEdge {
  @minLength(1)
  id: string;

  @minLength(1)
  source: string;

  @minLength(1)
  target: string;
}

// Runtime validation also enforces unique IDs and valid edge references.
model Architecture {
  @minLength(1)
  name: string;

  @minItems(1)
  nodes: ArchitectureNode[];

  edges: ArchitectureEdge[];
}
