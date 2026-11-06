# Cookbook

Keep behavioral constraints, dependency rules, contracts, and observability definitions next to the implementation.

| Concern | Location | Check |
| --- | --- | --- |
| Behavior | `behavior/*.feature`, steps in `test/steps` | `bun run test:behavior` |
| Dependencies | `../.dependency-cruiser.cjs` | `bun run check:dependencies` |
| HTTP interfaces | `interfaces/openapi.json` — OpenAPI 3.2.1 | `bun run check:cookbook` |
| Events | `interfaces/asyncapi.json` — AsyncAPI 3.1.0 | `bun run check:cookbook` |
| Observability | `observability/service.json` — `openslo/v1` | `bun run check:cookbook` |

The HTTP and event files are empty contract templates, not implemented endpoints or a running message transport. The OpenSLO Service identifies Choom; add SLI/SLO definitions once there is a real signal and an agreed objective. Do not invent availability targets for the bootstrap.

The Spectral check enforces pinned specification identifiers and required project metadata. The JSON reference resolver reports invalid local references and has no external resolvers enabled. This is a project policy check, **not full OpenAPI, AsyncAPI, or OpenSLO schema validation**. Add specification-aware schema validation as real interfaces and indicators are introduced.

Cucumber includes Gherkin 42.0.1. The starter scenarios exercise the same Zod architecture model used by the application. Bun tests cover invalid identifiers, dangling edges, automatic layout, and the React shell; Playwright covers loading and closing the example in a browser.

Specifications: [OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html), [AsyncAPI 3.1.0](https://www.asyncapi.com/docs/reference/specification/v3.1.0), [OpenSLO v1](https://openslo.com/specification/).
