# Writing Good Gherkin

A practical guide for writing Gherkin scenarios that stay at the right level of abstraction.

Sources: [Cucumber – Writing better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/) and [Automation Panda – BDD 101: Writing Good Gherkin](https://automationpanda.com/2017/01/30/bdd-101-writing-good-gherkin/).

## Core rules

1. **Describe behaviour, not implementation.**\
   Focus on *what* the system does, not *how* it does it.

2. **One scenario, one behaviour.**\
   If you have more than one When-Then pair, split into separate scenarios.

3. **Declarative over imperative.**\
   Describe the outcome, not the clicks, field names, or method calls.

4. **Write so a non-developer can understand it.**\
   Treat other readers as you would want to be treated.

5. **Ask this question:**\
   “Will this wording need to change if the implementation changes?”\
   If yes, raise the level of abstraction.

## Good vs bad

**Too low-level (avoid):**

```gherkin
When I enter "Bob" in the "user name" field
And I enter "tester" in the "password" field
And I press the "Submit" button
Then I should see the "welcome" page
```

**Better:**

```gherkin
When "Bob" logs in with valid credentials
Then he sees the welcome page
```

**Imperative (brittle):**

```gherkin
Given users with a free subscription can access "FreeArticle1" but not "PaidArticle1"
When I type "freeFrieda@example.com" in the email field
And I type "validPassword123" in the password field
And I press the "Submit" button
Then I see "FreeArticle1" on the home page
And I do not see "PaidArticle1" on the home page
```

**Declarative (preferred):**

```gherkin
Given Free Frieda has a free subscription
When Free Frieda logs in with her valid credentials
Then she sees a Free article
```

## Step types

- **Given** — sets up the initial context or state.
- **When** — describes the action or event.
- **Then** — describes the observable outcome.

Keep them in order. Do not put a When after a Then, or a Given after a When.

## Phrasing tips

- Prefer third person (“the user logs in”) over first person (“I log in”).
- Avoid UI details (button labels, CSS selectors, field names).
- Avoid implementation details (class names, method calls, database tables).
- Keep scenarios short (roughly 3–5 steps).
- Use domain language the business already uses.

## Quick checklist

- [ ] Would a product owner understand this without explanation?
- [ ] Would this still be true if we rewrote the UI or internal structure?
- [ ] Does this scenario cover exactly one behaviour?
- [ ] Are the steps declarative rather than a list of clicks or calls?

If any answer is no, rewrite the scenario at a higher level.
