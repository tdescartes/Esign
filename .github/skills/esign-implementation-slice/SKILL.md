---
name: esign-implementation-slice
description: 'Implement the next Esign feature slice safely. Use when adding or fixing sender flow, signer flow, shared contracts, API endpoints, signing fields, certificates, templates, sequential signing, auth, or webhook behavior in this repo.'
argument-hint: 'Describe the feature slice or bug to implement'
user-invocable: true
---

# Esign Implementation Slice

Use this skill when you need to finish one product slice without drifting across the whole repo.

## What this skill optimizes for

- Start from the narrowest implementation anchor.
- Keep frontend, backend, and shared contracts consistent.
- Preserve existing signing-flow behavior unless the task explicitly changes it.
- Validate immediately after the first real edit.

## Primary code surfaces

- `frontend/src/` for active UI behavior.
- `backend/server.js` and neighboring backend modules for API and workflow logic.
- `shared/index.d.ts` for contract changes.
- `frontend/legacy-demo.html` only as a parity reference.

## Procedure

1. Identify the smallest controlling surface for the request.
2. Check whether the behavior is defined by backend routes, frontend state flow, or shared contracts.
3. If the request touches payload shape or response shape, update `shared/index.d.ts` in the same slice.
4. Make the smallest plausible edit first.
5. Immediately validate with the narrowest executable check available.
6. Finish with repo-level validation:
   - `npm run lint`
   - `npm test`
   - `npm run build:web`

## Product priorities for this repo

If the user asks what to finish next, bias toward these in order:

1. Real PDF rendering and flattening.
2. Sequential signing enforcement.
3. Sender authentication.
4. Webhook subscriptions and delivery.
5. Embedded signing and templates.

## Notes

- Use `frontend/legacy-demo.html` to resolve UI ambiguity, not as the default edit target.
- Prefer changes in the flat workspace over root-level legacy duplicates.
