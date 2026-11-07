import { CST, Lexer } from "yaml";
import { CodecProblem, MAX_YAML_NODES, structureLimit } from "./limits.ts";

const MAX_YAML_TOKENS = 1_500_000;

function checkLines(text: string): void {
  const lineBreak = /\r\n|[\r\n]/gu;
  let lines = 0;
  while (lineBreak.test(text)) {
    if (++lines > MAX_YAML_NODES) structureLimit();
  }
}

export function checkYamlTokenLimits(text: string): void {
  checkLines(text);
  let tokens = 0;
  let commas = 0;
  let scalarSource = false;
  for (const lexeme of new Lexer().lex(text)) {
    if (++tokens > MAX_YAML_TOKENS) {
      throw new CodecProblem("limit-exceeded", "The architecture document exceeds the YAML token limit.");
    }
    // After the scalar marker, the whole lexeme is data, even if it looks like punctuation.
    if (!scalarSource && lexeme === "," && ++commas > MAX_YAML_NODES) structureLimit();
    scalarSource = !scalarSource && lexeme === CST.SCALAR;
  }
}
