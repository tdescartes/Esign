---
name: esign-release-readiness
description: 'Drive Esign toward a production-ready roadmap. Use when planning or implementing PDF support, sequential signing, auth, webhooks, storage hardening, audit evidence, or deployment readiness for this e-signature application.'
argument-hint: 'Describe the readiness area to assess or implement'
user-invocable: true
---

# Esign Release Readiness

Use this skill to keep work aligned with what will actually move this project from demo scaffold to usable product.

## Readiness tracks

### 1. Document fidelity

- Render real PDFs.
- Flatten completed values into PDF bytes.
- Hash the final artifact, not only canonical JSON.

### 2. Signing workflow

- Enforce `signing_order` for sequential signing.
- Improve portal token lifecycle and expiration.
- Add reminders and delivery-state tracking.

### 3. Identity and evidence

- Add sender authentication.
- Improve signer attribution.
- Expand audit evidence captured at completion.

### 4. Platform integrations

- Webhook subscriptions.
- Embedded signing.
- Templates and reusable signer roles.

## Procedure

1. Determine which readiness track the request belongs to.
2. Check whether the current code already has a scaffold for it.
3. Prefer shipping one vertical slice at a time.
4. Document any API or data-model expansion in `docs/ARCHITECTURE.md`.
5. Validate with root commands after each slice.

## Exit criteria

A readiness slice is not complete until:

- Code paths are implemented.
- Shared contracts are updated if needed.
- Docs reflect the new behavior.
- `npm run lint`, `npm test`, and `npm run build:web` pass.
