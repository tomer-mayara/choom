import { describe, expect, test } from "bun:test";
import { checkReasoningNotSaved, checkVisibleResponse } from "../../src/llm-response.ts";

// The rule of the design: do not save hidden reasoning. A saved LLM response holds
// only the visible answer, and its call record says that hidden reasoning was not saved.
const responseFile = "llm/analysis-response.md";
const refusal = `${responseFile} contains a hidden reasoning block. Save only the visible response.`;
const fence = "```";
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

const refusedResponses: [string, string][] = [
  ["a thinking block before the answer", "<thinking>\nThe CLI starts first.\n</thinking>\n\nThe review follows.\n"],
  ["a tag after spaces in another letter case", "The review follows.\n\n   <Thinking>\nCheck the CLI.\n   </Thinking>\n"],
  ["a tag after a tab", "\t<thinking>Check the CLI.</thinking>\n"],
  ["a tag after a byte order mark", "﻿<thinking>\nCheck the CLI.\n</thinking>\nThe review follows.\n"],
  ["a tag after a no-break space", "The review follows.\n <reasoning>Check the CLI.</reasoning>\n"],
  ["a reasoning block", "<reasoning>\nCheck the CLI.\n</reasoning>\nThe review follows.\n"],
  ["a redacted thinking block with an attribute", "<redacted_thinking data=\"abc\"/>\nThe review follows.\n"],
  ["a tag after a closed fence", `${fence}yaml\nformatVersion: 1\n${fence}\n<thinking>\nCheck the CLI.\n</thinking>\n`],
  ["a tag after Windows line ends", "The review follows.\r\n<thinking>\r\nCheck the CLI.\r\n</thinking>\r\n"],
  ["a raw provider response with a thinking block", json({ role: "assistant", content: [
    { type: "thinking", thinking: "Check the CLI.", signature: "abc" }, { type: "text", text: "The review follows." }] })],
  ["a raw provider response with a redacted thinking block", json({ content: [{ type: "redacted_thinking", data: "abc" },
    { type: "text", text: "The review follows." }] })],
  ["a raw provider response with a nested reasoning item", json({ output: [{ type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text: "The review follows." }] }] })],
  ["a JSON array of content blocks", `  ${JSON.stringify([{ type: "thinking", thinking: "Check." }])}  `],
  ["a think block of an open-weight model", "<think>\nThe CLI starts first.\n</think>\n\nThe review follows.\n"],
  ["a thinking block after text on the same line", "The review follows. <thinking>Check the CLI.</thinking>\nformatVersion: 1\n"],
  ["a reasoning block that starts after text and ends on a later line",
    "The review follows. <reasoning>\nCheck the CLI.\n</reasoning>\nformatVersion: 1\n"],
  ["a raw provider response with a thought part", json({ candidates: [{ content: { parts: [
    { text: "Check the CLI.", thought: true }, { text: "The review follows." }] } }] })],
  ["a raw provider event stream with a thinking block", "event: content_block_start\n" +
    `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } })}\n\n`],
  ["JSON lines with a reasoning item", `${JSON.stringify({ type: "reasoning", summary: [] })}\n` +
    `${JSON.stringify({ type: "message", content: [{ type: "output_text", text: "The review follows." }] })}\n`],
];

const acceptedResponses: [string, string][] = [
  ["prose that mentions thinking", "My thinking: the CLI starts the server.\nThinking about the gaps, one remains.\n"],
  ["an inline mention of the tag", "The answer omits the <thinking> block, as the cookbook says.\n"],
  ["a tag inside a fenced code block", `The prompt shows the tag:\n\n${fence}text\n<thinking>\nExample.\n</thinking>\n${fence}\n`],
  ["a tag inside a tilde fence that a longer fence closes", "~~~\n<reasoning>\nExample.\n~~~~\nThe review follows.\n"],
  ["a tag inside a fence that is not closed", `${fence}text\n<thinking>\nExample.\n`],
  ["fenced YAML", `The review follows.\n\n${fence}yaml\nformatVersion: 1\nllmReview: recorded\n${fence}\n`],
  ["JSON with a text block only", json({ content: [{ type: "text", text: "The review follows." }] })],
  ["a JSON entry plan", json({ formatVersion: 1, candidates: [{ id: "s2-candidate-001", roles: ["application"] }] })],
  ["text that starts like JSON but is not JSON", "{ The review follows. }\n"],
  ["both tags in inline code", "The answer omits the `<thinking>` and `</thinking>` tags.\n"],
  ["a word that starts like a tag", "<thinker> is not a tag of a reasoning block.\n"],
  ["a closing tag before an opening tag", "The answer has no </thinking> tag and no <thinking> block.\n"],
  ["a stream of text only", `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "The review." } })}\n`],
  ["a stream line inside a fenced code block", `${fence}text\ndata: ${JSON.stringify({ content_block: { type: "thinking" } })}\n${fence}\n`],
  ["a JSON value that names thought as text", json({ content: [{ type: "text", text: "The review follows.", thought: "none" }] })],
];

describe("checkVisibleResponse", () => {
  test.each(refusedResponses)("refuses %s", (_name, response) => {
    expect(() => checkVisibleResponse(response, responseFile)).toThrow(refusal);
  });

  test.each(acceptedResponses)("accepts %s", (_name, response) => {
    expect(() => checkVisibleResponse(response, responseFile)).not.toThrow();
  });

  test("names the file of the stage in the refusal", () => {
    expect(() => checkVisibleResponse("<thinking>\n", "llm-response.md"))
      .toThrow(new Error("llm-response.md contains a hidden reasoning block. Save only the visible response."));
  });
});

describe("checkReasoningNotSaved", () => {
  const call = { provider: "unknown", model: "unknown", date: "unknown", settings: "unknown" };

  test("accepts a call record that says hidden reasoning was not saved", () => {
    expect(() => checkReasoningNotSaved({ ...call, hiddenReasoning: "not-saved" }, "llm-call.yaml")).not.toThrow();
  });

  test.each([["no value", call], ["another value", { ...call, hiddenReasoning: "saved" }],
    ["a null value", { ...call, hiddenReasoning: null }], ["a value that is not text", { ...call, hiddenReasoning: true }],
    ["a call record that is a list", [{ hiddenReasoning: "not-saved" }]], ["no call record", null]])(
    "refuses a call record with %s", (_name, record) => {
      expect(() => checkReasoningNotSaved(record, "llm/plan-call.yaml"))
        .toThrow(new Error("Record hiddenReasoning: not-saved in llm/plan-call.yaml."));
    });
});
