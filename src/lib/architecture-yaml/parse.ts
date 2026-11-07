import { Composer, CST, isScalar, Parser, visit } from "yaml";
import { assertJsonScalar } from "./json-data.ts";
import { checkYamlTokenLimits } from "./lex.ts";
import { invalidEncoding, MAX_YAML_DEPTH, MAX_YAML_NODES, structureLimit, utf8Bytes } from "./limits.ts";

function rejectProperties(tokens: readonly CST.SourceToken[]): void {
  if (tokens.some(({ type }) => type === "anchor")) invalidEncoding("YAML anchors are unsupported.");
  if (tokens.some(({ type }) => type === "tag")) invalidEncoding("Explicit YAML tags are unsupported.");
}

function checkFlowItems(collection: CST.FlowCollection): void {
  for (const [index, item] of collection.items.entries()) {
    const commas = item.start.reduce((count, { type }) => count + Number(type === "comma"), 0);
    const empty = item.key === undefined && !item.sep && !item.value;
    if (commas > 1 || (index === 0 && commas > 0)
      || (index > 0 && !empty && commas === 0)
      || (empty && index < collection.items.length - 1)) {
      invalidEncoding("YAML flow collections must use valid separators.");
    }
  }
}

function checkStructure(document: CST.Document): void {
  let nodes = 0;

  function countNode(): void {
    if (++nodes > MAX_YAML_NODES) structureLimit();
  }

  function inspect(token: CST.Token | null | undefined, depth: number): void {
    countNode();
    if (token?.type === "alias") invalidEncoding("YAML aliases are unsupported.");
    if (token?.type === "error") invalidEncoding("The file must contain valid YAML.");
    if (!CST.isCollection(token)) {
      // The public CST resolver can stop at the first error, even in one very large scalar.
      if (token?.type !== "block-scalar" || depth > 0) {
        CST.resolveAsScalar(token, true, () => invalidEncoding("YAML scalar syntax is invalid."));
      }
      return;
    }
    if (depth >= MAX_YAML_DEPTH) structureLimit();
    if (token.type === "flow-collection") checkFlowItems(token);

    const sequence = token.type === "block-seq"
      || (token.type === "flow-collection" && token.start.type === "flow-seq-start");
    for (const { start, key, sep, value } of token.items) {
      rejectProperties(start);
      if (sep) rejectProperties(sep);
      if (key === undefined && !value && !start.some(({ type }) => type === "seq-item-ind")) continue;

      // A flow sequence can contain a mapping pair without explicit braces.
      const implicitMap = sequence && key !== undefined;
      const childDepth = depth + (implicitMap ? 2 : 1);
      if (implicitMap) {
        if (depth + 1 >= MAX_YAML_DEPTH) structureLimit();
        countNode();
      }
      if (!sequence || implicitMap) inspect(key, childDepth);
      inspect(value, childDepth);
    }
  }

  rejectProperties(document.start);
  inspect(document.value, 0);
}

function* checkedTokens(text: string): Generator<CST.Token> {
  let documents = 0;
  for (const token of new Parser().parse(text)) {
    if (token.type === "directive") invalidEncoding("YAML directives are unsupported.");
    if (token.type === "error") invalidEncoding("The file must contain valid YAML.");
    if (token.type === "document") {
      if (++documents !== 1) invalidEncoding("The file must contain one YAML document.");
      checkStructure(token);
    }
    yield token;
  }
  if (documents !== 1) invalidEncoding("The file must contain one YAML document.");
}

export function readYamlData(text: string): unknown {
  utf8Bytes(text);
  checkYamlTokenLimits(text);
  // Check each map in one pass after composition to avoid repeated scans of wide maps.
  const composer = new Composer({
    schema: "core", version: "1.2", strict: true, merge: false, resolveKnownTags: false,
    uniqueKeys: false, prettyErrors: false,
  });
  const [document] = [...composer.compose(checkedTokens(text))];
  if (!document || document.errors.length || document.warnings.length) {
    invalidEncoding("The file must contain valid YAML.");
  }

  visit(document, {
    Map: (_key, map) => {
      const keys = new Set<string>();
      for (const { key } of map.items) {
        if (!isScalar(key) || typeof key.value !== "string") {
          invalidEncoding("YAML mapping keys must be strings.");
        }
        if (keys.has(key.value)) invalidEncoding("YAML mapping keys must be unique.");
        keys.add(key.value);
      }
    },
    Scalar: (_key, scalar) => assertJsonScalar(scalar.value),
  });
  return document.toJS({ maxAliasCount: 0 });
}
