---
name: esign-demo-parity
description: 'Compare the React frontend against the preserved legacy demo and close migration gaps. Use when the app behaves differently between frontend/src and frontend/legacy-demo.html, or when porting demo features such as field placement, signer portal interactions, completion flow, or certificate rendering.'
argument-hint: 'Describe the parity gap between React and the legacy demo'
user-invocable: true
---

# Esign Demo Parity

This skill is for finishing the React migration without losing working behavior from the legacy demo.

## When to use

- A flow exists in `frontend/legacy-demo.html` but is missing or weaker in `frontend/src`.
- A signer or sender interaction looks wrong after migration.
- You need to port one remaining demo capability into React.

## Comparison workflow

1. Read the relevant behavior in `frontend/legacy-demo.html`.
2. Find the owning React surface in `frontend/src`.
3. Identify whether the gap is UI-only, state-management, or API-contract related.
4. Port only the missing behavior; do not re-copy the legacy file structure.
5. Keep all new state and side effects aligned with the backend API client.

## High-value parity targets

- Signature capture UX.
- Sender field placement and reassignment.
- Portal progress and consent gating.
- Audit and certificate presentation.
- Demo document rendering fidelity.

## Validation

- Run `npm test`.
- Run `npm run build:web`.
- If the change affects the API contract or portal completion behavior, run full repo validation from the root.
