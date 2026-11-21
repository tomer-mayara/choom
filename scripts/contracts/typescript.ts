import { dirname, relative } from "node:path";
import {
  getNamespaceFullName,
  isArrayModelType,
  isRecordModelType,
  type Interface,
  type Model,
  type ModelProperty,
  type Namespace,
  type Program,
  type Statement,
  type Type,
} from "@typespec/compiler";
import { SyntaxKind, type Node } from "@typespec/compiler/ast";
import { getExtensions } from "@typespec/json-schema";

interface Target {
  namespace: string;
  path: string;
  /** The package export that other workspaces use to import this output. */
  module?: string;
  includes?: (name: string) => boolean;
  reexport?: string;
}

const baselineNamespace = "Choom.BaselineModel";
const legacyRecord = (name: string) => !/^(?:Boundary|Isolation)/.test(name)
  && name !== "Baseline" && name !== "BaselineV6" && name !== "BaselineBoundaryReview";

const targets: readonly Target[] = [
  {
    namespace: baselineNamespace, path: "packages/baseline-model/src/generated/records.ts",
    includes: legacyRecord, module: "@choom/baseline-model/contracts",
  },
  {
    namespace: baselineNamespace, path: "packages/baseline-model/src/generated/contracts.ts",
    includes: (name) => !legacyRecord(name), reexport: "./records",
    module: "@choom/baseline-model/contracts",
  },
  { namespace: "Choom.Domain", path: "src/domain/generated/contracts.ts" },
  { namespace: "Choom.Producer", path: "packages/producer/src/generated/contracts.ts" },
  { namespace: "Choom.Desktop", path: "src/platform/generated/contracts.ts" },
  { namespace: "Choom.Documents", path: "src/lib/generated/contracts.ts" },
  { namespace: "Choom.Workspace", path: "src/architecture/generated/workflow.ts" },
];

function workspaceOf(path: string): string {
  return /^packages\/[^/]+\//.exec(path)?.[0] ?? "";
}

// An output in another workspace is imported through that package's exports.
function importPath(source: Target, target: Target): string {
  if (target.module && workspaceOf(source.path) !== workspaceOf(target.path)) return target.module;
  const path = relative(dirname(source.path), target.path).replaceAll("\\", "/").replace(/\.ts$/, "");
  return path.startsWith(".") ? path : `./${path}`;
}

function identifier(name: string): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Unsupported TypeScript name: ${name}`);
  return name;
}

function primitiveReference(type: Type): string | undefined {
  if (type.kind === "String" || type.kind === "Boolean") return JSON.stringify(type.value);
  if (type.kind === "Number") {
    const value = type.numericValue.asNumber();
    if (value === null || !Number.isFinite(value)) throw new Error(`Unsupported numeric literal: ${type.valueAsString}`);
    return JSON.stringify(value);
  }
  // `unknown` is a field that a contract checks by name only, such as the
  // discovery result fields that the viewer does not read.
  if (type.kind === "Intrinsic" && (type.name === "null" || type.name === "void" || type.name === "unknown")) return type.name;
  if (type.kind === "Scalar" && type.namespace?.name === "TypeSpec") {
    if (type.name === "string" || type.name === "boolean") return type.name;
    if (type.name === "integer" || type.name === "float64") return "number";
  }
  return undefined;
}

/** Track which emitted file owns each referenced type while preserving package exports. */
class BindingImports extends Map<string, string> {
  readonly source: Target;
  constructor(source: Target) { super(); this.source = source; }
}

function namedReference(namespace: Namespace, name: string, imports: BindingImports): string {
  const destination = targets.find((candidate) => candidate.namespace === getNamespaceFullName(namespace)
    && (candidate.includes?.(name) ?? true));
  if (!destination) throw new Error(`Unbound contract namespace: ${getNamespaceFullName(namespace)}`);
  if (destination === imports.source) return identifier(name);
  const alias = identifier(destination.namespace.replaceAll(".", ""));
  imports.set(alias, importPath(imports.source, destination));
  return `${alias}.${identifier(name)}`;
}

function reference(type: Type, owner: Namespace, imports: BindingImports): string {
  if (type.kind === "Model" && isArrayModelType(type)) {
    return `Array<${reference(type.indexer.value, owner, imports)}>`;
  }
  if (type.kind === "Model" && type.name === "Record" && type.namespace?.name === "TypeSpec" && isRecordModelType(type)) {
    return `Record<string, ${reference(type.indexer.value, owner, imports)}>`;
  }
  const primitive = primitiveReference(type);
  if (primitive !== undefined) return primitive;
  if (type.kind === "Union" && !type.name) {
    return [...type.variants.values()].map((variant) => reference(variant.type, owner, imports)).join(" | ");
  }
  if (
    (type.kind === "Model" || type.kind === "Scalar" || type.kind === "Union") &&
    type.namespace && type.name
  ) return namedReference(type.namespace, type.name, imports);
  throw new Error(`Unsupported contract type: ${type.kind} in ${getNamespaceFullName(owner)}`);
}

function parameter(property: ModelProperty, owner: Namespace, imports: BindingImports): string {
  if (property.defaultValue !== undefined) throw new Error(`Unsupported default: ${property.name}`);
  return `${identifier(property.name)}${property.optional ? "?" : ""}: ${reference(property.type, owner, imports)}`;
}

function modelDeclaration(program: Program, model: Model, owner: Namespace, imports: BindingImports): string {
  if (isArrayModelType(model)) {
    return `export type ${identifier(model.name)} = Array<${reference(model.indexer.value, owner, imports)}>;`;
  }
  if (isRecordModelType(model) && model.properties.size === 0 && !model.baseModel) {
    return `export interface ${identifier(model.name)} {\n  [key: string]: ${reference(model.indexer.value, owner, imports)};\n}`;
  }
  if (model.baseModel || model.indexer || model.sourceModels.length > 0) {
    throw new Error(`Unsupported model inheritance, spread, or indexer: ${model.name}`);
  }
  const properties = [...model.properties.values()].map((property) => `  ${parameter(property, owner, imports)};`);
  if (properties.length === 0 && getExtensions(program, model)
    .some(({ key, value }) => key === "additionalProperties" && value === false)) {
    return `export type ${identifier(model.name)} = Record<string, never>;`;
  }
  return `export interface ${identifier(model.name)} {\n${properties.join("\n")}\n}`;
}

function interfaceDeclaration(contract: Interface, owner: Namespace, imports: BindingImports): string {
  if (contract.sourceInterfaces.length > 0) throw new Error(`Unsupported interface inheritance: ${contract.name}`);
  const operations = [...contract.operations.values()].map((operation) => {
    if (operation.node?.templateParameters.length || operation.sourceOperation) {
      throw new Error(`Unsupported operation template or alias: ${operation.name}`);
    }
    const parameters = [...operation.parameters.properties.values()]
      .map((property) => parameter(property, owner, imports)).join(", ");
    return `  ${identifier(operation.name)}(${parameters}): ${reference(operation.returnType, owner, imports)};`;
  });
  return `export interface ${identifier(contract.name)} {\n${operations.join("\n")}\n}`;
}

function namespaceDeclarations(program: Program, owner: Namespace, emitted: Set<Node>, target: Target): string[] {
  if (owner.operations.size || owner.enums.size || owner.decoratorDeclarations.size || owner.functionDeclarations.size) {
    throw new Error(`Unsupported declaration in ${getNamespaceFullName(owner)}`);
  }
  const imports = new BindingImports(target);
  const types = [
    ...owner.models.values(), ...owner.scalars.values(),
    ...owner.unions.values(), ...owner.interfaces.values(),
  ].filter((type) => target.includes?.(type.name ?? "") ?? true).sort((left, right) => (left.name ?? "") < (right.name ?? "") ? -1 : 1);
  const declarations = types.map((type) => {
    if (!type.name || !type.node || ("templateParameters" in type.node && type.node.templateParameters.length > 0)) {
      throw new Error(`Unsupported generated or template declaration: ${type.name}`);
    }
    emitted.add(type.node);
    if (type.kind === "Model") return modelDeclaration(program, type, owner, imports);
    if (type.kind === "Interface") return interfaceDeclaration(type, owner, imports);
    if (type.kind === "Scalar") {
      if (!type.baseScalar || type.constructors.size) throw new Error(`Unsupported scalar: ${type.name}`);
      return `export type ${identifier(type.name)} = ${reference(type.baseScalar, owner, imports)};`;
    }
    const variants = [...type.variants.values()].map((variant) => reference(variant.type, owner, imports));
    if (variants.length === 0) throw new Error(`Empty union: ${type.name}`);
    return `export type ${identifier(type.name)} = ${variants.join(" | ")};`;
  });
  return [
    ...[...imports].sort(([left], [right]) => left < right ? -1 : 1)
      .map(([name, path]) => `import type * as ${name} from ${JSON.stringify(path)};`),
    ...(target.reexport ? [`export type * from ${JSON.stringify(target.reexport)};`] : []),
    ...declarations,
  ];
}

function requireEmitted(statements: readonly Statement[], emitted: Set<Node>): void {
  for (const statement of statements) {
    if (statement.kind === SyntaxKind.ImportStatement || statement.kind === SyntaxKind.UsingStatement) continue;
    if (statement.kind === SyntaxKind.NamespaceStatement) {
      const children = statement.statements;
      if (children) requireEmitted(Array.isArray(children) ? children : [children], emitted);
    } else if (!emitted.has(statement)) {
      throw new Error(`Unsupported or unbound TypeSpec declaration: ${SyntaxKind[statement.kind]}`);
    }
  }
}

// This binding supports the current non-HTTP contracts only. New language
// constructs must get an explicit mapping before they can enter generated types.
export function emitTypeScript(program: Program, sources: Set<string>): Map<string, string> {
  const output = new Map<string, string>();
  const emitted = new Set<Node>();
  for (const target of targets) {
    const [owner] = program.resolveTypeReference(target.namespace);
    if (owner?.kind !== "Namespace") throw new Error(`Missing contract namespace: ${target.namespace}`);
    const declarations = namespaceDeclarations(program, owner, emitted, target);
    output.set(target.path, [
      "// Generated from TypeSpec by bun run contracts:generate. Do not edit.",
      "", ...declarations.map((declaration) => `${declaration}\n`),
    ].join("\n"));
  }
  for (const path of sources) {
    const source = program.sourceFiles.get(path);
    if (!source) throw new Error(`Contract was not compiled: ${path}`);
    requireEmitted(source.statements, emitted);
  }
  return output;
}
