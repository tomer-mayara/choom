import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compile, formatDiagnostic, NodeHost, normalizePath, resolveCompilerOptions,
  type Diagnostic, type Program,
} from "@typespec/compiler";
import { $lib as jsonSchemaLibrary } from "@typespec/json-schema";
import { validateComponents } from "../validate-components";
import { emitTypeScript } from "./typescript";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceDirectory = resolve(root, "cookbook/interfaces");
const schemaDirectory = "cookbook/interfaces/generated";
const generatedDirectories = [
  schemaDirectory, "src/domain/generated", "src/platform/generated", "src/architecture/generated",
  "src/architecture/dependency-cruiser/generated",
  "src/lib/generated",
];

function requireNoDiagnostics(diagnostics: readonly Diagnostic[]): void {
  if (diagnostics.length > 0) throw new Error(diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("\n"));
}

async function contractSources(program: Program): Promise<Set<string>> {
  const sources = new Set([...(await validateComponents(root))].map(normalizePath));
  for (const path of sources) {
    if (!program.sourceFiles.has(path)) throw new Error(`TypeSpec contract is not imported by main.tsp: ${path}`);
  }
  for (const [path, source] of program.sourceFiles) {
    if (program.getSourceFileLocationContext(source.file).type === "project" && !sources.has(path)) {
      throw new Error(`Compiled contract is not a registered source: ${path}`);
    }
  }
  return sources;
}

async function expectedFiles(temporary: string): Promise<Map<string, string>> {
  const entrypoint = resolve(sourceDirectory, "main.tsp");
  const [options, diagnostics] = await resolveCompilerOptions(NodeHost, {
    entrypoint: normalizePath(entrypoint), cwd: normalizePath(root),
    overrides: { outputDir: normalizePath(temporary) },
  });
  requireNoDiagnostics(diagnostics);
  const emitter = jsonSchemaLibrary.name;
  if (options.emit?.length !== 1 || options.emit[0] !== emitter) {
    throw new Error(`Contract generation requires only ${emitter}`);
  }
  const schemaOptions = options.options?.[emitter];
  if (schemaOptions?.bundleId !== "contracts.schema.json" || schemaOptions["file-type"] !== "json") {
    throw new Error("Contract generation requires the contracts.schema.json bundle");
  }
  const program = await compile(NodeHost, normalizePath(entrypoint), {
    ...options, outputDir: normalizePath(temporary),
    options: { [emitter]: { ...schemaOptions, "emitter-output-dir": normalizePath(temporary) } },
  });
  requireNoDiagnostics(program.diagnostics);
  const sources = await contractSources(program);
  const expected = emitTypeScript(program, sources);
  for await (const path of new Bun.Glob("**/*").scan({ cwd: temporary, onlyFiles: true })) {
    if (!path.endsWith(".json")) throw new Error(`Unexpected schema output: ${path}`);
    expected.set(`${schemaDirectory}/${normalizePath(path)}`, await readFile(join(temporary, path), "utf8"));
  }
  if (!expected.has(`${schemaDirectory}/contracts.schema.json`)) throw new Error("JSON Schema emitter produced no contract bundle");
  return expected;
}

async function compareOrWrite(expected: Map<string, string>, write: boolean): Promise<void> {
  const actual = new Set<string>();
  for (const directory of generatedDirectories) {
    if (!existsSync(resolve(root, directory))) continue;
    for await (const path of new Bun.Glob("**/*").scan({ cwd: resolve(root, directory), onlyFiles: true, dot: true })) {
      actual.add(`${directory}/${normalizePath(path)}`);
    }
  }
  for (const path of actual) {
    if (!expected.has(path)) throw new Error(`Unexpected generated file; remove the obsolete output: ${path}`);
  }
  for (const [path, content] of expected) {
    const destination = resolve(root, path);
    if (write) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    } else if (!actual.has(path) || await readFile(destination, "utf8") !== content) {
      throw new Error(`Generated contract is stale or missing: ${path}. Run bun run contracts:generate.`);
    }
  }
}

async function run(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--write")) {
    throw new Error("Usage: bun scripts/contracts/generate.ts [--write]");
  }
  const temporary = await mkdtemp(join(tmpdir(), "choom-contracts-"));
  try {
    await compareOrWrite(await expectedFiles(temporary), arguments_[0] === "--write");
    console.log(arguments_[0] === "--write" ? "Generated TypeSpec contracts" : "TypeSpec contracts and generated outputs are current");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await run();
