// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export interface Architecture {
  name: string;
  nodes: Array<ArchitectureNode>;
  edges: Array<ArchitectureEdge>;
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
}

export interface ArchitectureNode {
  id: string;
  label: string;
}
