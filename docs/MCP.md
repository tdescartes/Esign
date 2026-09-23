# MCP Stack For Finishing Esign

This repo does not need every MCP server. It needs a small stack that removes the current bottlenecks without wasting context budget.

## Recommended MCP servers

### 1. Context7 or equivalent docs MCP

Use for:

- version-specific library and framework documentation
- reducing wrong API guesses for fast-moving packages
- current usage references for `pdf.js`, `pdf-lib`, React, Vite, Express, and `better-sqlite3`

Why it matters here:

- this repo's next hard slice is PDF work, where outdated examples cause bad method calls quickly
- this is the highest-leverage read-only MCP for this stack

### 2. GitHub MCP

Use for:

- creating and triaging issues
- turning roadmap items into tracked work
- drafting PR descriptions and linking implementation work

Why it matters here:

- this project already has a concrete roadmap but no structured execution queue
- feature slices like PDF support, sequential signing, auth, and webhooks should become issues with acceptance criteria

### 3. Playwright MCP

Use for:

- browser-driven verification of sender flow
- signer portal interaction checks
- screenshot capture for UI regressions
- validating React migration parity against the legacy demo

Why it matters here:

- this app has interactive sender and signer flows that lint and unit tests do not fully cover
- the current repo needs end-to-end confidence more than more static analysis

### 4. Chrome DevTools MCP

Use for:

- console and network debugging in the browser
- diagnosing why sender or signer flows misbehave
- checking client errors that compile and unit tests miss

Why it matters here:

- Playwright is better for scripted flows, but DevTools is often faster when the bug is in network or console behavior

### 5. Postgres MCP

Use for:

- schema inspection after moving beyond SQLite
- migration verification
- query inspection once persistence becomes more complex

Why it matters here:

- this repo is still on SQLite, so Postgres MCP is conditional rather than day-one setup

## Nice-to-have MCP servers

### HTTP or OpenAPI MCP

Useful if this repo grows a documented external API surface.

Use for:

- contract inspection
- request replay
- endpoint verification outside the browser

## Suggested order

1. Connect Context7 or another docs MCP.
2. Connect GitHub MCP.
3. Connect Playwright MCP.
4. Add Chrome DevTools MCP when debugging browser behavior starts dominating.
5. Add Postgres MCP only when persistence moves beyond SQLite.

## Guardrails

- Keep the connected MCP set small. Every server adds tool schema and context overhead.
- Prefer five useful servers over a long uncurated list.
- Treat browser-driving MCPs as untrusted-input surfaces and avoid visiting arbitrary pages.
- Avoid outdated tutorials that point to archived or unmaintained reference servers.

## What to do with them in this repo

### GitHub MCP issue backlog

Create at least these issues:

- real PDF rendering with `pdf.js`
- PDF flattening and final-artifact hashing with `pdf-lib`
- sequential signing enforcement using `signing_order`
- sender authentication
- webhook subscriptions and delivery retries
- embedded signing surface
- template and signer-role support

### Playwright MCP acceptance flows

Automate these flows first:

- sender creates a document and sends it
- signer opens portal and completes all required fields
- final signer completion produces a certificate view
- invalid or expired portal behavior
- sequential signing block when enabled

### Docs/context MCP targets

Keep current references handy for:

- `pdf.js`
- `pdf-lib`
- React
- Vite
- Express
- `better-sqlite3`

## Practical note

If you want, the next step after this file is to add a workspace MCP config example for the exact servers you choose. The config format depends on the MCP host you use, so that should be created against your actual provider rather than guessed.
