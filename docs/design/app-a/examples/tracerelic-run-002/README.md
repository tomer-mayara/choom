# TraceRelic run-002 worked example

This extract follows two paths from a completed architecture review. The collector calls a configuration loader in production source. An API integration test registers a health route on its own server instance. Both paths have a call site. Only the first supports a production caller.

## Open the example in Choom

1. In **Open Baseline**, choose [baseline.yaml](baseline.yaml). In **Production**, select **Collector configuration**. Under **Provides**, expand the **Local collector** caller. The two sites are the import and the call to `GlobalConfigLoader.load`. The viewer also shows **Permitted callers unknown** and **Caller coverage incomplete**.
2. Turn on **Show non-production**, choose **Discovery**, then **Open discovery result** and select [discovery.yaml](discovery.yaml). The summary shows one question and one gap. Select **API environment checks** and expand **Evidence** to read the health-route walkthrough and the open deployment question.

## Repeat the checks on another repository

| Check | What the reviewer could establish in this run | What to inspect in the next run |
| --- | --- | --- |
| Bind a caller to its operation | The CLI imports the loader directly on line 2 and awaits its static method on line 24. The configuration barrel also exports the loader. [CLI import](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/cli.ts#L2), [CLI call](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/cli.ts#L21-L25), [declaration](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/global-config-loader.ts#L10-L16), [barrel](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/index.ts#L1-L3) | Trace the written import, the exact call expression and the target declaration. Record the caller's role and the limits of the search. Permission needs its own evidence. |
| Identify who creates the host | The test creates Fastify, registers `GET /health`, injects a request and checks the response in one callback. The run left the deployed API startup unknown. [Registration and request](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/api/test/integration/environment.test.ts#L5-L12) | Follow a route candidate to its host. Find the startup or listener that serves production traffic before assigning the route to production. Record the missing link as a question. |
| Check claims against declarations and assertions | The original configuration purpose called the returned object immutable. Its class declares a TypeScript `readonly` field and assigns it in the constructor. This extract describes the absolute path that the loader returns. A separate history example labelled its result complete but omitted `sourceFile` and `timestamp` from the expected value. [Configuration class](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/global-config.ts#L4-L12), [loader return](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/src/config/global-config-loader.ts#L36-L39), [history assertion](https://github.com/tomer-mayara/TraceRelic/blob/3a35b6ebfd003f6ee30d916e874617dafeb0d28d/apps/collector/test/interface/history/local-llm-history-codex.test.ts#L12-L21) | Check each claimed guarantee against the implementation and every field of a “complete” example against the assertion. Record the exact field, correction and effect in the handoff. |

Use the [analysis quality plan](../../analysis-quality-plan.md) to apply these checks at each stage.

## Scope and provenance

The full run analysed the TraceRelic working tree at base commit `3a35b6ebfd003f6ee30d916e874617dafeb0d28d`. Its fixed pair contains nine proposed components, six interfaces, eight inspected paths, six questions and 41 gaps. The two downloads here select three components, one interface, and the parts of the two paths shown above. Their 16 source locations refer to 11 files whose complete bytes matched the public commit and the saved source hashes.

The example keeps the original IDs for the selected components, operations, uses, question and gap. Membership, roles and the caller search cover the displayed files. The two configuration purpose fields describe the supported return value. The interface summary and lifecycle describe the observed CLI use. The question and gap cite the selected test range and name the API component so readers can open them there. The inventory digest, mapping and stage artifact IDs identify the original run. Full evidence and verification receipts live in that run.

| Fixed file in the original run | Bytes | SHA-256 |
| --- | ---: | --- |
| `baselines/baseline-002/baseline.yaml` | 411,879 | `2e0e5f78744ed502ac7e3818ea080fd4d6e219fe3660669484719659b3ed9b89` |
| `runs/run-002/discovery.yaml` | 62,700 | `f534a85b0e1e57a53352cf23bc18cd49b3126a74120e11deb6995549151a9ec1` |

In the fixed baseline, inspect `/boundaryReview/accesses/1` for the production call, `/boundaryReview/operations/24` for the test handler, and `/interfaces/2/documentation/entries/0/examples/0/content/value/result` for the history example. In the fixed discovery, `/inspectedPaths/0` and `/inspectedPaths/3` are the original walkthroughs.

The example has its own baseline ID, `baseline-002-example`. Its discovery records the SHA-256 of the example baseline's UTF-8 bytes, `d80039f99b81092df18adfb5067427f57b4202cf6c1ec5ba6bf0c8a2cb42665d`. The viewer checks both values when it opens the pair.
