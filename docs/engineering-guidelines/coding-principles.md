# Coding principles

Start with one Gherkin scenario from the feature plan (BDD). Run it through a
public entry point as an acceptance test. While it is red, drive each missing
rule, contract, or collaboration with a focused test. Apply red–green–refactor
(TDD) at every test level the scenario needs.

1. **Red.** Write the test before changing production code. Run it and confirm
   that it fails because the planned behavior is missing.
2. **Green.** Make the smallest change that satisfies the test and the written
   constraints. Rerun the test and see it pass.
3. **Refactor.** With the test green, simplify the code while preserving the
   behavior. Rerun the affected tests after each refactor.

## Test Levels

- **Acceptance:** The user or caller's outcome through the same entry point used in production.
- **Interface.** Wrap every external library and every external API in a
  TraceRelic-owned class. Only the wrapper imports the library or calls the API.
  Interface tests exercise the real wrapper through its public methods and verify
  its contract for inputs, outputs, events, and errors. For API wrappers, inject
  a mock transport that serves fixture responses locally.
- **Integration:** Wire together the real implementations of all participating TraceRelic components and exercise their public interfaces.
- **Unit:**  Exercise one component's rules and edge cases. Mock every other TraceRelic component it depends on, including those in the same workspace.

Use a fixture to wire dependencies through **ports and adapters** in both unit and integration tests. A port is the interface a component uses to call a dependency. The fixture supplies mock adapters for every external system, including databases and third-party APIs.

### Fixture example

Suppose the collector reads a session from SQLite and submits its token count
to the TraceRelic API through a client wrapper. The unit and integration tests
exercise the collector. The interface test exercises the wrapper.

| Test | Fixture wiring (pseudocode) | Expected result |
| --- | --- | --- |
| Unit | `Collector(db = mockDb(inputTokens = 120), api = mockApi)` | The API mock receives a report with 120 input tokens. |
| Integration | `Collector(db = mockDb(inputTokens = 120), api = realApi)` | The real API accepts the collector's 120-token report. |
| Interface | `client = new UsageApiClient(transport = mockHttp(status = 429))` | Calling `client.submit({inputTokens: 120})` rejects with the wrapper's `RateLimitError`. |

### Interface test for a library wrapper

Suppose TraceRelic's `SessionUsageStore` wraps `better-sqlite3`. Its
`openInMemory()` method opens a fresh SQLite database for each test.

```ts
test("reads the input tokens recorded for a session", (t) => {
  const store = SessionUsageStore.openInMemory();
  t.after(() => store.close());

  store.recordUsage({ sessionId: "s1", inputTokens: 120 });
  assert.equal(store.inputTokensFor("s1"), 120);
});
```

## Finish a scenario

Finish the scenario by running the acceptance test and its supporting tests together.

## Refactor code with limited test coverage 

For a refactor of untested code, first capture its current behavior in a passing test.

## Implementation and verification

- Write all code in TypeScript, including tests and scripts. Use precise types
  for inputs, state, and results. Start with `unknown` for unverified input and
  narrow it before use.
- Strongly prefer classes over standalone functions. Group related state and
  behavior in the owning class. Keep implementation details private and expose
  only the operations callers need.
- Keep each rule with the component that owns it. Validate external inputs at
  the boundary and make side effects and failures explicit.
- Reuse existing code. Extract shared logic when a third use expresses the same rule.
- If a constraint changes, update the plan and its artifact before implementing
  the revised behavior.

Place TypeScript tests beside the code they exercise as `*.test.ts`. Run
`bun run test`, `bun run lint`, and the checks named in the plan on the combined
change. See the [repository checks](../../README.md#run-the-checks).
