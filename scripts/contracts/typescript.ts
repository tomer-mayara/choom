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

const targets = [
  { namespace: "Choom.Domain", path: "src/domain/generated/contracts.ts" },
  { namespace: "Choom.Desktop", path: "src/platform/generated/contracts.ts" },
  { namespace: "Choom.Discovery", path: "src/architecture/generated/contracts.ts" },
  { namespace: "Choom.DepCruiser", path: "src/architecture/dependency-cruiser/generated/contracts.ts" },
];

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
  if (type.kind === "Intrinsic" && type.name === "null") return "null";
  if (type.kind === "Scalar" && type.namespace?.name === "TypeSpec") {
    if (type.name === "string" || type.name === "boolean") return type.name;
    if (type.name === "integer" || type.name === "float64") return "number";
  }
  return undefined;
}

function namedReference(namespace: Namespace, name: string, owner: Namespace, imports: Map<string, string>): string {
  if (namespace === owner) return identifier(name);
  const target = targets.find((candidate) => candidate.namespace === getNamespaceFullName(namespace));
  const source = targets.find((candidate) => candidate.namespace === getNamespaceFullName(owner));
  if (!target || !source) throw new Error(`Unbound contract namespace: ${getNamespaceFullName(namespace)}`);
  const alias = identifier(target.namespace.replaceAll(".", ""));
  const path = relative(dirname(source.path), target.path).replaceAll("\\", "/").replace(/\.ts$/, "");
  imports.set(alias, path.startsWith(".") ? path : `./${path}`);
  return `${alias}.${identifier(name)}`;
}

function reference(type: Type, owner: Namespace, imports: Map<string, string>): string {
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
  ) return namedReference(type.namespace, type.name, owner, imports);
  throw new Error(`Unsupported contract type: ${type.kind} in ${getNamespaceFullName(owner)}`);
}

function parameter(property: ModelProperty, owner: Namespace, imports: Map<string, string>): string {
  if (property.defaultValue !== undefined) throw new Error(`Unsupported default: ${property.name}`);
  return `${identifier(property.name)}${property.optional ? "?" : ""}: ${reference(property.type, owner, imports)}`;
}

function modelDeclaration(model: Model, owner: Namespace, imports: Map<string, string>): string {
  if (model.baseModel || model.indexer || model.sourceModels.length > 0) {
    throw new Error(`Unsupported model inheritance, spread, or indexer: ${model.name}`);
  }
  const properties = [...model.properties.values()].map((property) => `  ${parameter(property, owner, imports)};`);
  return `export interface ${identifier(model.name)} {\n${properties.join("\n")}\n}`;
}

function interfaceDeclaration(contract: Interface, owner: Namespace, imports: Map<string, string>): string {
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

function namespaceDeclarations(owner: Namespace, emitted: Set<Node>): string[] {
  if (owner.operations.size || owner.enums.size || owner.decoratorDeclarations.size || owner.functionDeclarations.size) {
    throw new Error(`Unsupported declaration in ${getNamespaceFullName(owner)}`);
  }
  const imports = new Map<string, string>();
  const types = [
    ...owner.models.values(), ...owner.scalars.values(),
    ...owner.unions.values(), ...owner.interfaces.values(),
  ].sort((left, right) => (left.name ?? "") < (right.name ?? "") ? -1 : 1);
  const declarations = types.map((type) => {
    if (!type.name || !type.node || ("templateParameters" in type.node && type.node.templateParameters.length > 0)) {
      throw new Error(`Unsupported generated or template declaration: ${type.name}`);
    }
    emitted.add(type.node);
    if (type.kind === "Model") return modelDeclaration(type, owner, imports);
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
    const declarations = namespaceDeclarations(owner, emitted);
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
