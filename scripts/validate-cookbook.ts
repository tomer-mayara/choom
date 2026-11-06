import { readFile } from "node:fs/promises";
import { Resolver } from "@stoplight/json-ref-resolver";
import { Spectral } from "@stoplight/spectral-core";
import { enumeration, truthy } from "@stoplight/spectral-functions";

// Local references only: validating a contract must not perform arbitrary network requests.
const resolver = new Resolver({ resolvers: {} });
const contracts = [
  {
    path: "cookbook/interfaces/openapi.json",
    versionField: "openapi",
    version: "3.2.1",
    required: ["info.title", "info.version", "paths"],
  },
  {
    path: "cookbook/interfaces/asyncapi.json",
    versionField: "asyncapi",
    version: "3.1.0",
    required: ["info.title", "info.version", "channels"],
  },
  {
    path: "cookbook/observability/service.json",
    versionField: "apiVersion",
    version: "openslo/v1",
    required: ["kind", "metadata.name", "spec.description"],
  },
];

let failed = false;
for (const contract of contracts) {
  const document: unknown = JSON.parse(
    await readFile(new URL(`../${contract.path}`, import.meta.url), "utf8"),
  );
  const resolved = await resolver.resolve(document);
  if (resolved.errors.length > 0) {
    console.error(contract.path, resolved.errors);
    failed = true;
    continue;
  }
  const spectral = new Spectral({ resolver });
  spectral.setRuleset({
    rules: {
      "pinned-spec-version": {
        given: "$",
        severity: "error",
        then: {
          field: contract.versionField,
          function: enumeration,
          functionOptions: { values: [contract.version] },
        },
      },
      "required-contract-fields": {
        given: "$",
        severity: "error",
        then: [contract.versionField, ...contract.required].map((field) => ({
          field,
          function: truthy,
        })),
      },
    },
  });
  const diagnostics = await spectral.run(resolved.result);
  if (diagnostics.length > 0) {
    console.error(contract.path, diagnostics);
    failed = true;
  } else {
    console.log(`Valid cookbook policy: ${contract.path}`);
  }
}

if (failed) process.exitCode = 1;
