import { describe, expect, test } from "bun:test";
import * as yaml from "yaml";
import { readBaselineYaml, validateDiscoveryRecords, validateRecords } from "../../../src/stage-6-records.ts";
import { candidatesRef, type Component, digest, type Documentation, evidenceRefs, files, location, type MappingUnit, proposal,
  recordInputs, type Records, runRef, selected, snapshotRef, type SourceAssessment, type SourceUse, stage, type Statement, statement }
  from "../../support/stage-6-records.ts";

// The shared record validator that Stages 4, 5 and 6 use. The validator runs the
// shared baseline rules of @choom/baseline-model, so this is an integration suite.
// The records are small in-memory copies modeled on the Stage 6 producer fixture
// (support/stage-6-records.ts).

function findComponent(records: Records, id: string): Component {
  const component = records.baseline.components.find((item) => item.id === id);
  if (!component) throw new Error(`Missing fixture component: ${id}`);
  return component;
}

function nameUnknownSubject(records: Records, subject: string): void {
  for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.forEach((gap) => { gap.subjectRefs = [subject]; });
}

function unownedFirstFile(reason: string) {
  return (records: Records): void => {
    findComponent(records, "cli").membership.value.paths = ["missing-dir/**"];
    Object.assign(records.mapping.units[0] ?? {}, { owner: null, membershipRef: null, reason });
  };
}

const refusedCases: [string, (records: Records) => void, string][] = [
  ["an accepted statement", (records) => {
    Object.assign(findComponent(records, "cli").purpose, { status: "accepted", acceptanceRef: "acc-1" });
  }, "Only proposed intent is supported: cli.purpose"],
  ["a cycle of component parents", (records) => {
    findComponent(records, "cli").parent = statement("http");
    findComponent(records, "http").parent = statement("cli");
  }, "The baseline is invalid at components.0.parent.value (component cli): Component parents must not form a cycle."],
  ["a file with two direct owners", (records) => {
    findComponent(records, "http").membership.value.paths.push("cli.ts");
  }, "Mapping and direct membership differ: cli.ts"],
  ["an unknown owner with a blank reason", unownedFirstFile(" "), "Invalid mapped unit or inspection coverage: cli.ts"],
  ["an inspected path without steps or limits", (records) => {
    records.discovery.inspectedPaths = [{ id: "path-1", description: "Route path.", entryPointRef: "http-route",
      componentIds: ["http"], evidenceRefs: ["orders-handler"] }];
  }, "Invalid inspected path: path-1"],
  ["a discovery that already names its baseline", (records) => {
    records.discovery.baselineRef = "base-1";
  }, "Expected complete working discovery with no fixed baseline reference."],
  ["code units smaller than a file", (records) => {
    records.mapping.scope.unitKind = "symbol";
  }, "Invalid selected code mapping scope."],
  ["a code mapping without one of the indexed files", (records) => { records.mapping.units.pop(); },
    "Invalid selected code mapping scope."],
  ["a file that the code mapping lists twice", (records) => {
    records.mapping.units[1] = { ...records.mapping.units[0] as MappingUnit, id: "unit-again" };
  }, "Invalid mapped unit or inspection coverage: cli.ts"],
  ["an unknown owner that names a membership", (records) => {
    unownedFirstFile("Owner unknown.")(records);
    Object.assign(records.mapping.units[0] ?? {}, { membershipRef: `${proposal}#/components/0/membership` });
  }, "Unknown unit selects a membership: cli.ts"],
  ["a mapped unit that names the membership of another component", (records) => {
    Object.assign(records.mapping.units[0] ?? {}, { membershipRef: `${proposal}#/components/1/membership` });
  }, "Mapped membership reference differs from proposed intent: cli.ts"],
  ["a behavior entry of a component that does not own its file", (records) => {
    Object.assign(records.entry.behaviorEntries[0] ?? {}, { componentRef: "cli" });
  }, "Behavior entry differs from the mapped source owner: http-route"],
  ["a glob membership selector", (records) => {
    findComponent(records, "cli").membership.value.paths = ["*.ts"];
  }, "The baseline is invalid at components.0.membership.value.paths.0 (component cli): " +
    "Expected a safe relative path or a subtree ending in '/**'."],
];

// The producer profile: rules that the producer adds to the shared baseline rules. Each case
// has its own message. A question or gap does not make a null purpose or grouping reason valid.
const profileCases: [string, (records: Records) => void, string][] = [
  ["a baseline with no components", (records) => {
    records.baseline.components = [];
  }, "The baseline has no components. The producer needs at least one component."],
  ["a null purpose with no question or gap", (records) => {
    findComponent(records, "cli").purpose.value = null;
  }, "Component cli has no purpose. The producer needs a purpose for each component."],
  ["a null purpose that a gap names", (records) => {
    findComponent(records, "cli").purpose.value = null;
    nameUnknownSubject(records, "cli.purpose");
  }, "Component cli has no purpose. The producer needs a purpose for each component."],
  ["a null grouping reason that a gap names", (records) => {
    findComponent(records, "http").groupingReason.value = null;
    nameUnknownSubject(records, "http.groupingReason");
  }, "Component http has no grouping reason. The producer needs a grouping reason for each component."],
  ["a membership with no paths", (records) => {
    findComponent(records, "http").membership.value.paths = [];
  }, "Component http has no membership paths. The producer needs at least one path for each component."],
  ["a version 6 baseline", (records) => {
    records.baseline.formatVersion = 6;
  }, "The producer writes baseline formatVersion 1, 2, 3, 4 or 5, not 6."],
];

describe("validateDiscoveryRecords", () => {
  test("accepts the reviewed records and counts what they contain", () => {
    expect(validateDiscoveryRecords(recordInputs())).toMatchObject({ mappedFiles: 2, unknownOwners: 0, components: 2,
      behaviorEntries: 1, gaps: 1, questions: 0, graphContexts: 1, sourceRecordsVerified: 1 });
  });

  test("accepts a file with an unknown owner and a reason", () => {
    expect(validateDiscoveryRecords(recordInputs(unownedFirstFile("Owner unknown.")))).toMatchObject({ unknownOwners: 1 });
  });

  // P1: a question or gap subject names something of the run (record-subjects.ts).
  test("refuses a question or gap subject that names nothing, with the gap ID and the subject", () => {
    expect(() => validateDiscoveryRecords(recordInputs((records) => nameUnknownSubject(records, "no-such-thing"))))
      .toThrow(new Error("Gap gap-1 names the subject no-such-thing, which is not a file or folder of the snapshot, " +
        "the snapshot ID, a question or gap, an entry candidate or a baseline item."));
  });

  test("accepts subjects that name a snapshot file, the snapshot ID, an entry candidate, a baseline item or its field, " +
    "and a question or gap", () => {
    const subjects = ["cli.ts", snapshotRef, "cli-candidate", "plugin-candidate", "http", "cli.purpose", "q-1"];
    const change = (records: Records): void => {
      const question = { id: "q-1", subjectRefs: ["gap-1"], text: "Which plugin starts first?", evidenceRefs };
      records.discovery.questions = [structuredClone(question)];
      records.entry.questions = [question];
      for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.forEach((gap) => { gap.subjectRefs = [...subjects]; });
    };
    expect(validateDiscoveryRecords(recordInputs(change))).toMatchObject({ gaps: 1, questions: 1 });
  });

  // The gaps of a Stage 1 tool record can name missing inputs and paths outside the snapshot.
  test("keeps the subjects of a gap that Stage 1 finish copied from the settings record", () => {
    const toolGap = { id: "s1-settings-gap-001", kind: "missing-input", reason: "The base settings are missing.",
      subjectRefs: ["tsconfig.missing.json", "/shared/global.d.ts"], evidenceRefs: ["settings-001#/gaps/0"] };
    const inputs = recordInputs((records) => {
      for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.push(structuredClone(toolGap));
    });
    const { id: _id, evidenceRefs: _evidence, ...entry } = toolGap;
    const settings = Buffer.from(JSON.stringify({ gaps: [entry] }));
    inputs.artifacts.set("settings-001", { path: "evidence/settings.json", bytes: settings, sha256: digest(settings) });
    expect(validateDiscoveryRecords(inputs)).toMatchObject({ gaps: 2 });
  });

  // Stage 3 can retire an earlier entry candidate with a note that names it, so a subject
  // can name a candidate of an earlier entry analysis of the selected history.
  test("accepts a subject that names an entry candidate of an earlier entry analysis", () => {
    const earlier = "s3-x-entry-analysis";
    const inputs = recordInputs((records) => {
      records.entry.previousEntryAnalysisRef = earlier;
      records.mapping.scope.historicalEntryAnalysisRefs = [earlier];
      nameUnknownSubject(records, "retired-candidate");
    });
    const save = (ref: string, path: string, value: unknown): void => {
      const bytes = Buffer.from(JSON.stringify(value));
      inputs.artifacts.set(ref, { path, bytes, sha256: digest(bytes) });
    };
    save(earlier, "evidence/s3-x/entry-analysis.yaml", { formatVersion: 1, kind: "entry-analysis", snapshotRef,
      llmReview: "recorded", reviewedFiles: [], questions: [], gaps: [], candidates: [{ id: "retired-candidate" }] });
    const access = JSON.parse((inputs.artifacts.get(selected.resourceAccessRef)?.bytes ?? "").toString()) as
      { scope: Record<string, unknown> };
    access.scope.historicalEntryAnalysisRefs = [earlier];
    save(selected.resourceAccessRef, "evidence/s5-x/resource-access.json", access);
    expect(validateDiscoveryRecords(inputs)).toMatchObject({ gaps: 1 });
  });

  // P2: only the entry site must be in a reviewed range. Today a step can cite an unread excerpt.
  test("accepts an inspected path step that cites a collected but unreviewed excerpt", () => {
    const inputs = recordInputs((records) => {
      records.discovery.inspectedPaths = [{ id: "path-1", description: "Route path.", entryPointRef: "http-route",
        componentIds: ["http"], evidenceRefs: ["unread-cli"], limits: ["l"],
        steps: [{ action: "Calls start.", evidenceRefs: ["unread-cli"] }] }];
    });
    expect(validateDiscoveryRecords(inputs)).toMatchObject({ mappedFiles: 2 });
  });

  test.each(refusedCases)("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(message);
  });

  // Defect 1: Stage 6 saves the fixed baseline under the baseline ID. The validator reserves that ID
  // for every stage, so Stages 4 and 5 refuse it while the operator can still correct the draft.
  test("refuses a component ID equal to the baseline ID with the Stage 4/5 and the Stage 6 reserved IDs", () => {
    const change = (records: Records): void => { records.baseline.id = "cli"; };
    const message = "The ID cli is reserved for the baseline. Use a different model ID.";
    expect(() => validateDiscoveryRecords({ ...recordInputs(change), reservedIds: [`${stage}-file@publication.json`] }))
      .toThrow(message);
    expect(() => validateDiscoveryRecords({ ...recordInputs(change), reservedIds: ["s6-x-discovery"] })).toThrow(message);
  });

  test("refuses a model ID that the publication reserves for one of its own records", () => {
    const receipt = `${stage}-file@publication.json`;
    const change = (records: Records): void => {
      for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.forEach((gap) => { gap.id = receipt; });
    };
    expect(() => validateDiscoveryRecords({ ...recordInputs(change), reservedIds: [receipt] }))
      .toThrow(`The ID ${receipt} is reserved for a record that this publication saves. Use a different model ID.`);
  });
});

// The entry analysis and the resource observations of Stages 4 and 5 name the candidates of Stage 4
// collect; the resource observations of these records always name them. The validator checks each
// candidate against the saved snapshot.
describe("validateDiscoveryRecords with the candidates of Stage 4 collect", () => {
  const named = (change: (records: Records) => void = () => {}) => (records: Records): void => {
    records.entry.behaviorEntryCandidatesRef = candidatesRef;
    change(records);
  };

  test("accepts candidates that lie in the saved snapshot", () => {
    expect(validateDiscoveryRecords(recordInputs(named()))).toMatchObject({ mappedFiles: 2 });
  });

  test.each<[string, (records: Records) => void, string]>([
    ["a candidate range outside the saved file", (records) => {
      Object.assign(records.candidates.candidates[0] ?? {}, { range: [{ line: 1, column: 1 }, { line: 1, column: 40 }] });
    }, "Behavior entry candidate 0 has a range outside the saved file http.ts."],
    ["a candidate that differs from the saved text", (records) => {
      Object.assign(records.candidates.candidates[0] ?? {}, { expression: "export function orders(id) {}" });
    }, "Behavior entry candidate 0 differs from the saved text at its range."],
    ["a reference to a record that is not the candidates", (records) => { records.entry.behaviorEntryCandidatesRef = "launch"; },
      "The entry analysis names launch as its behavior entry candidates, which is not a saved candidates record."],
    ["a resource access candidate outside the saved file", (records) => { Object.assign(records.resourceCandidates.candidates[0] ?? {},
      { range: [{ line: 1, column: 1 }, { line: 1, column: 40 }] }); }, "Resource access candidate 0 has a range outside the saved file http.ts."],
  ])("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(named(change)))).toThrow(message);
  });
});

describe("validateRecords with a Stage 6 readiness packet", () => {
  const draftDigests = { "run.yaml": digest("run"), "baseline.yaml": digest("baseline"), "discovery.yaml": digest("discovery") };
  const identity = { formatVersion: 1, runRef, snapshotRef, baselineId: "base-1" };
  const readiness = { ...identity, status: "ready-with-gaps", draftDigests, selectedRefs: selected,
    checks: [{ id: "review-complete", text: "Checked the saved launch settings.", evidenceRefs }], limits: ["l"] };

  const call = { provider: "fixture", model: "fixture", date: "2026-01-01", settings: "unknown", hiddenReasoning: "not-saved" };

  function packet(changes: { readiness?: object; response?: string; call?: object } = {}): Map<string, Buffer> {
    const readinessText = JSON.stringify({ ...readiness, ...changes.readiness });
    return new Map(Object.entries({
      "readiness.yaml": readinessText,
      "review-scope.json": JSON.stringify({ ...identity, suppliedArtifactRefs: evidenceRefs, limits: ["l"] }),
      "llm/analysis-prompt.md": "Review the saved launch evidence.\n",
      "llm/analysis-response.md": changes.response ?? readinessText,
      "llm/analysis-call.yaml": JSON.stringify(changes.call ?? call),
    }).map(([name, text]) => [name, Buffer.from(text)]));
  }

  test("accepts a readiness review that matches the drafts and selected facts", () => {
    expect(validateRecords({ ...recordInputs(), packet: packet(), draftDigests })).toMatchObject({ mappedFiles: 2 });
  });

  test("refuses a readiness status other than ready-with-gaps", () => {
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ readiness: { status: "ready" } }), draftDigests }))
      .toThrow("Readiness review does not match the current drafts and selected facts.");
  });

  test("refuses a response that does not contain the readiness record", () => {
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ response: "Summary only." }), draftDigests }))
      .toThrow("Incomplete readiness prompt, response or call metadata.");
  });

  // The design rule "Do not save hidden reasoning".
  test("refuses a response that holds a reasoning block", () => {
    const response = "<thinking>\nCheck the launch settings.\n</thinking>\n" + JSON.stringify(readiness);
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ response }), draftDigests }))
      .toThrow("llm/analysis-response.md contains a hidden reasoning block. Save only the visible response.");
  });

  test("refuses a call record that does not say that hidden reasoning was not saved", () => {
    const { hiddenReasoning: _saved, ...withoutField } = call;
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ call: withoutField }), draftDigests }))
      .toThrow("Record hiddenReasoning: not-saved in llm/analysis-call.yaml.");
  });
});

// A version 4 baseline with one documented interface and one source-use assessment.
// The use and its note cite the reviewed handler range; http owns http.ts.
const unreadLocation = { snapshotRef, path: "cli.ts", sha256: digest(files["cli.ts"] ?? ""), lines: [1, 1] };
const cited = <T>(value: T, refs: string[]): Statement<T> => ({ value, status: "proposed", evidenceRefs: refs });

function ordersDocumentation(records: Records): Documentation {
  const item = records.baseline.interfaces[0] as { documentation: Documentation } | undefined;
  if (!item) throw new Error("Add the orders interface first.");
  return item.documentation;
}

function ordersUse(records: Records): { assessment: SourceAssessment; use: SourceUse } {
  const assessment = records.baseline.sourceUsage?.assessments[0];
  const use = assessment?.uses[0];
  if (!assessment || !use) throw new Error("Add the orders source use first.");
  return { assessment, use };
}

function withOrdersInterface(records: Records): void {
  records.baseline.formatVersion = 4;
  records.baseline.interfaces = [{ id: "orders-api", name: "Orders API", owner: statement("cli"),
    publicAccess: statement(["GET /orders"]), allowedConsumers: statement(["http"]),
    promises: statement({ behavior: "List orders.", data: "Orders.", errors: "Request errors.", lifecycle: "Active." }),
    documentation: { summary: statement("Order operations."), sourceNotes: [], entries: [{ id: "list-orders",
      name: "List orders", accessPoint: "GET /orders", kind: statement("command"),
      description: statement<string | null>("Return the saved orders."), examples: [] }] } }];
  records.baseline.sourceUsage = { snapshotRef, mappingRef: selected.codeMappingRef, assessments: [{
    interfaceId: "orders-api", scope: "The saved HTTP handler.", evidenceRefs: ["orders-handler"], limitations: [],
    uses: [{ id: "http-lists-orders", consumerId: "http", kind: "value", context: "application",
      description: "The handler lists the orders.", callerRef: "orders-handler", evidenceRefs: ["orders-handler"] }],
    sourceNotes: [{ evidenceRef: "orders-handler", description: "The saved handler range.", location }] }] };
}

function documented(change: (records: Records) => void) {
  return (records: Records): void => {
    withOrdersInterface(records);
    change(records);
  };
}

const usePath = "orders-api.sourceUsage.uses.http-lists-orders";
const runCheckCases: [string, (records: Records) => void, string][] = [
  ["a null documentation fact that no question or gap names", documented((records) => {
    const entry = ordersDocumentation(records).entries[0];
    if (entry) entry.description.value = null;
  }), "Invalid or unexplained documentation fact: orders-api.documentation.entries.list-orders.description"],
  ["a source-reviewed example that cites a range outside the review history", documented((records) => {
    const documentation = ordersDocumentation(records);
    documentation.sourceNotes.push({ evidenceRef: "unread-cli", description: "The CLI range.", location: unreadLocation });
    documentation.entries[0]?.examples.push({ id: "start-example", name: "Start", basis: "source-reviewed",
      content: cited({ text: "start()" }, ["unread-cli"]) });
  }), "Source-reviewed example needs its own reviewed range and location note: " +
    "orders-api.documentation.entries.list-orders.examples.start-example"],
  ["a source note whose location differs from its saved source record", documented((records) => {
    const note = ordersUse(records).assessment.sourceNotes[0];
    if (note) note.location = { ...location, lines: [1, 2] };
  }), "Source note differs from its saved source record: orders-handler"],
  ["a source use whose consumer is not the mapped owner of the caller", documented((records) => {
    ordersUse(records).use.consumerId = "cli";
  }), `Source consumer differs from the direct mapped caller owner: ${usePath}`],
  ["a source use with an unknown context that no question or gap names", documented((records) => {
    ordersUse(records).use.context = "unknown";
  }), `Missing exact discovery subject for unresolved source use: ${usePath}.context`],
  ["a source use outside the review history", documented((records) => {
    const { assessment, use } = ordersUse(records);
    Object.assign(use, { callerRef: "unread-cli", evidenceRefs: ["unread-cli"] });
    assessment.sourceNotes.push({ evidenceRef: "unread-cli", description: "The CLI range.", location: unreadLocation });
  }), `Source use is outside the selected source review history: ${usePath}: unread-cli`],
  ["a source-use assessment of another mapping", documented((records) => {
    if (records.baseline.sourceUsage) records.baseline.sourceUsage.mappingRef = "old-mapping";
  }), "sourceUsage.mappingRef differs from the selected candidate mapping."],
  ["more than 500 architecture records", (records) => {
    records.baseline.rules = Array.from({ length: 499 }, (_, index) => ({ id: `rule-${index}`, name: "Rule",
      subject: statement(null), expected: statement(null), check: statement(null) }));
  }, "Baseline exceeds the 500-record display limit."],
  ["more than 16 component levels", (records) => {
    const chain = Array.from({ length: 17 }, (_, index): Component => ({ id: `level-${index}`, name: "Level",
      purpose: statement("Group the level."), membership: statement({ paths: [`level-${index}/**`] }),
      groupingReason: statement("One level."), ...(index > 0 ? { parent: statement(`level-${index - 1}`) } : {}) }));
    records.baseline.components.push(...chain);
  }, "Baseline exceeds the 16-parent-level display limit."],
  ["a baseline with a parent version", (records) => {
    records.baseline.parentId = "base-0";
  }, "Expected a first proposed baseline."],
];

describe("run checks of the baseline against the saved records", () => {
  test("accepts a version 4 baseline with interface documentation and source use", () => {
    expect(validateDiscoveryRecords(recordInputs(withOrdersInterface))).toMatchObject({ mappedFiles: 2, components: 2 });
  });

  test.each(runCheckCases)("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(message);
  });
});

describe("the producer profile", () => {
  test.each(profileCases)("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(message);
  });
});

// @choom/baseline-model checks the baseline shape, as the viewer does. The message
// names the path, the item that it is in, and the shared rule.
const sharedRuleCases: [string, (records: Records) => void, string][] = [
  ["an item ID that two collections use", (records) => {
    records.baseline.interfaces = [{ id: "cli", name: "CLI", owner: statement("cli"), publicAccess: statement(["serve"]),
      allowedConsumers: statement(["http"]), promises: statement(null) }];
  }, "The baseline is invalid at interfaces.0.id (interface cli): Duplicate item ID: cli."],
  ["a symbol selector in a version 4 baseline", (records) => {
    records.baseline.formatVersion = 4;
    Object.assign(findComponent(records, "cli").membership.value, { symbols: [{ path: "cli.ts", symbol: "start" }] });
  }, "The baseline is invalid at components.0.membership.value (component cli): Unrecognized key: \"symbols\""],
  ["a documentation entry with an access point that the interface does not record", documented((records) => {
    const entry = ordersDocumentation(records).entries[0];
    if (entry) entry.accessPoint = "POST /orders";
  }), "The baseline is invalid at interfaces.0.documentation.entries.0.accessPoint (interface orders-api): " +
    "Entry access must match this interface's recorded access."],
  ["a source use reference without a located note", documented((records) => {
    ordersUse(records).assessment.sourceNotes = [];
  }), "The baseline is invalid at sourceUsage.assessments.0.uses.0.evidenceRefs.0: " +
    "Every use evidence reference needs a source note with a location."],
];

describe("the shared baseline rules", () => {
  test.each(sharedRuleCases)("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(message);
  });
});

describe("readBaselineYaml", () => {
  test("reads one YAML document as JSON-compatible data", () => {
    expect(readBaselineYaml(Buffer.from("formatVersion: 1\nid: base-1\nparentId: null\n"), yaml))
      .toEqual({ formatVersion: 1, id: "base-1", parentId: null });
  });

  test.each([
    ["an anchor and an alias", "a: &shared 1\nb: *shared\n", "Baseline YAML anchors and explicit tags are unsupported."],
    ["a repeated mapping key", "a: 1\na: 2\n", "Baseline YAML mapping keys must be unique strings."],
    ["two documents", "a: 1\n---\nb: 2\n", "Baseline must contain one YAML document."],
    ["an explicit tag", "a: !!str 1\n", "Baseline YAML anchors and explicit tags are unsupported."],
    ["a custom tag", "a: !custom 1\n", "Baseline YAML anchors and explicit tags are unsupported."],
    ["an alias without an anchor", "a: *shared\n", "Baseline YAML aliases and syntax errors are unsupported."],
    ["a key that is not a string", "1: a\n", "Baseline YAML mapping keys must be unique strings."],
    ["no document", "", "Baseline must contain one YAML document."],
    ["a directive", "%YAML 1.2\n---\na: 1\n", "Baseline YAML directives and syntax errors are unsupported."],
    ["a flow sequence that does not end", "a: [1, 2\n", "Baseline must contain valid YAML."],
    ["a number that is not finite", "a: .inf\n", "Baseline must contain JSON-compatible data."],
    ["an escape that YAML does not define", 'a: "\\q"\n', "Invalid baseline YAML scalar."],
    ["two commas in a flow sequence", "a: [1,,2]\n", "Invalid baseline YAML flow separators."],
    ["33 nested levels", `a: ${"[".repeat(33)}${"]".repeat(33)}\n`, "Baseline exceeds the YAML structure limit."],
    ["more than 1,500,000 lexer tokens", "- [[[[x]]]]\n".repeat(130_000), "Baseline exceeds the YAML token limit."],
    ["more than 16 MiB", "#".repeat(16 * 1024 * 1024 + 1), "Baseline exceeds the 16 MiB file limit."],
  ])("refuses %s", (_name, text, message) => {
    expect(() => readBaselineYaml(Buffer.from(text), yaml)).toThrow(new Error(message));
  });

  test("refuses bytes that are not UTF-8", () => {
    expect(() => readBaselineYaml(Buffer.from([0x61, 0x3a, 0x20, 0xff, 0x0a]), yaml)).toThrow("Baseline must use UTF-8.");
  });
});
