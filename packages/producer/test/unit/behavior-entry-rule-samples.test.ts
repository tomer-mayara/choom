import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import * as yaml from "yaml";
import { callCandidates, type EntryCandidate, entryQuery } from "../../src/behavior-entry-calls.ts";
import { behaviorEntryRulesPath, readRuleList } from "../../src/behavior-entry-rules.ts";
import type { BehaviorEntryCallRule } from "../../src/generated/contracts.ts";
import { toolsRoot, withScratch } from "../support/commands.ts";
import { type Files, projectOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// The call rules of the pinned rule list of the producer, each on a sample call
// that the documentation of its library shows. Each rule finds its sample with the
// name and the handler of the sample, and no rule finds the same call on another
// receiver with the same name. The test reads the real list, so a new call rule
// needs a sample here.
//
// A receiver is the documented code that makes the value whose method a group of
// rules calls, and other code that gives a value of the same name that is not it.
interface Receiver { extension: "js" | "ts"; entryKind: string; start: string; others: Record<string, string> }
// A sample call on its receiver, with its name. « and » mark the handler in the call.
interface Sample { receiver: Receiver; call: string; name: string }

// The Express hello world example.
const expressApp: Receiver = { extension: "js", entryKind: "http-route",
  start: "const express = require('express')\nconst app = express()\n", others: {
    "a Map": "const app = new Map()\n",
    "the app of another package": "const express = require('other')\nconst app = express()\n",
    "a local function with the name of the import": "function express() {\n  return new Map()\n}\nconst app = express()\n",
  } };

// The routes of the Express routing guide and the basic routing example. A method that
// they do not show has the form of the methods that they show, as app.METHOD allows.
const samples: Record<string, Sample> = {
  "express-route-get": { receiver: expressApp, name: "/example/b", call: "app.get('/example/b', (req, res, next) => {\n" +
    "  console.log('the response will be sent by the next function ...')\n  next()\n}, «(req, res) => {\n" +
    "  res.send('Hello from B!')\n}»)" },
  "express-route-post": { receiver: expressApp, name: "/",
    call: "app.post('/', «(req, res) => {\n  res.send('Got a POST request')\n}»)" },
  "express-route-put": { receiver: expressApp, name: "/user",
    call: "app.put('/user', «(req, res) => {\n  res.send('Got a PUT request at /user')\n}»)" },
  "express-route-patch": { receiver: expressApp, name: "/user",
    call: "app.patch('/user', «(req, res) => {\n  res.send('Got a PATCH request at /user')\n}»)" },
  "express-route-delete": { receiver: expressApp, name: "/user",
    call: "app.delete('/user', «(req, res) => {\n  res.send('Got a DELETE request at /user')\n}»)" },
  "express-route-options": { receiver: expressApp, name: "/user",
    call: "app.options('/user', «(req, res) => {\n  res.send('Got an OPTIONS request at /user')\n}»)" },
  "express-route-head": { receiver: expressApp, name: "/user",
    call: "app.head('/user', «(req, res) => {\n  res.send('Got a HEAD request at /user')\n}»)" },
  "express-route-all": { receiver: expressApp, name: "/secret", call: "app.all('/secret', «(req, res, next) => {\n" +
    "  console.log('Accessing the secret section ...')\n  next() // pass control to the next handler\n}»)" },
};

const callRules = readRuleList(readFileSync(join(toolsRoot, behaviorEntryRulesPath)), yaml).rules
  .filter((rule): rule is BehaviorEntryCallRule => rule.kind === "call");
const plain = (call: string): string => call.replace("«", "").replace("»", "");
// The text of a file: a receiver, then the call.
const fileText = (start: string, call: string): string => start + "\n" + plain(call) + "\n";
const samplePath = (rule: BehaviorEntryCallRule, sample: Sample): string => `${rule.id}/sample.${sample.receiver.extension}`;
const otherPath = (rule: BehaviorEntryCallRule, sample: Sample, index: number): string =>
  `${rule.id}/other-${index}.${sample.receiver.extension}`;

// The sample file and the files of the other receivers of each rule that has a sample.
function sampleFiles(): Files {
  return Object.fromEntries(callRules.flatMap((rule) => {
    const sample = samples[rule.id];
    if (sample === undefined) return [];
    return [[samplePath(rule, sample), fileText(sample.receiver.start, sample.call)],
      ...Object.values(sample.receiver.others).map((start, index) => [otherPath(rule, sample, index), fileText(start, sample.call)])];
  }));
}

// The candidates of all the call rules in each file. One snapshot project holds the
// files. Each file is a module, so the files do not share their top-level names.
let found = new Map<string, EntryCandidate[]>();
beforeAll(() => {
  const files = sampleFiles();
  found = withScratch((scratch) => {
    const query = entryQuery(projectOf(scratch, files, { allowJs: true, moduleDetection: tsMorph.ts.ModuleDetectionKind.Force }));
    return new Map(Object.keys(files).map((path) => [path, callCandidates(query, path, callRules)]));
  });
}, 60_000);

function sampleOf(rule: BehaviorEntryCallRule): Sample {
  const sample = samples[rule.id];
  if (sample === undefined) throw new Error(`The call rule ${rule.id} has no sample. Add a documented call of its library.`);
  return sample;
}

test("each call rule of the pinned list has a sample, and each sample has its rule in the list", () => {
  expect(Object.keys(samples).sort()).toEqual(callRules.map(({ id }) => id).sort());
});

test.each(callRules.map((rule) => [rule.id, rule] as const))("%s finds its sample call with the name and the handler",
  (_id, rule) => {
    const sample = sampleOf(rule);
    const path = samplePath(rule, sample);
    const text = fileText(sample.receiver.start, sample.call);
    const call = plain(sample.call);
    expect(found.get(path)).toEqual([{ ruleId: rule.id, ruleVersion: rule.version, entryKind: sample.receiver.entryKind,
      range: rangeIn(text, call), expression: call, truncated: false, name: sample.name, nameReason: null,
      handler: { path, range: rangeIn(text, sample.call) }, handlerReason: null }]);
  });

test.each(callRules.flatMap((rule) => Object.keys(samples[rule.id]?.receiver.others ?? {})
  .map((other, index) => [rule.id, other, rule, index] as const)))("no rule finds the sample call of %s on %s",
  (_id, _other, rule, index) => {
    expect(found.get(otherPath(rule, sampleOf(rule), index))).toEqual([]);
  });
