# Esign Copilot Instructions

This repository is a flat npm workspace with active code in `frontend/`, `backend/`, `shared/`, and `docs/`.

## Project map

- `frontend/` is the active UI target: React, TypeScript, Vite.
- `frontend/legacy-demo.html` is a parity reference, not the primary app shell.
- `backend/` is the active Express API and SQLite implementation.
- `shared/` contains cross-app TypeScript contracts and must stay in sync with both frontend and backend behavior.
- Root-level `index.html`, `server.js`, and `ARCHITECTURE.md` are legacy reference artifacts unless the task explicitly targets them.

## Working rules

- Prefer changes in `frontend/src`, `backend`, `shared`, and `docs` over root-level legacy duplicates.
- When changing request or response shapes, update `shared/index.d.ts` first or in the same change.
- Preserve the core signing flow: draft document, recipients, fields, send, portal open, field completion, signer completion, certificate retrieval.
- Treat `frontend/legacy-demo.html` as a behavior reference when React behavior is unclear.
- Keep SQLite-backed backend behavior stable unless the task explicitly changes persistence or API semantics.

## Validation

Run these commands from the repo root after substantive changes:

```bash
npm run lint
npm test
npm run build:web
```

When changing the sender or signer flow, prefer validating the backend integration test and the frontend build before broader cleanup.
