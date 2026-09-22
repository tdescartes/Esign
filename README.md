# Esign Workspace

This repository now uses a flat workspace layout with top-level frontend, backend, shared, and docs folders.

## Workspace layout

- `frontend`: React frontend and the preserved legacy HTML demo.
- `backend`: Express API and SQLite-backed signing flow.
- `shared`: Shared contract package for frontend and server models.
- `docs`: Architecture and product notes.

## Current status

Root-level `server.js`, `index.html`, and `ARCHITECTURE.md` are legacy duplicates from early scaffolding. They are preserved temporarily for reference only; active application work now lives in `frontend/`, `backend/`, `shared/`, and `docs/`.

## Workspace commands

Run commands from the repository root:

```bash
npm install
npm run dev:api
npm run dev:web
```

For product details and implementation notes, see `docs/ESIGN.md`.

## How the demo maps to the backend

The demo (`index.html`) holds state in the browser so it works with zero setup.
The backend implements the **same model** — documents, recipients, fields, audit
events — behind real endpoints. To connect them, swap the demo's in-memory updates
for the calls in `frontend/api-client.js`. Nothing you see in the demo is throwaway.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data model, the legal
backbone (intent / consent / attribution / integrity), what's simulated vs. real,
and the roadmap.

## Next steps (good first PRs)

- Render real PDFs with **pdf.js** and flatten signed values into PDF bytes with **pdf-lib**.
- Add **sequential signing** (the `signing_order` column is already there).
- **Templates** + reusable signer roles ("Signer A / Signer B") for repeatable sends.
- **Embedded signing** component so partners can sign inside their own apps.
- Sender **authentication** and per-owner **webhook** subscriptions.

## License

Released under the **MIT License** (see `LICENSE`) — permissive, so businesses can
embed it freely. If you'd rather protect the commons (require anyone running a
modified network service to publish their changes), the norm in this space is
**AGPL-3.0**; both major open-source peers use it. Pick before your first public
release — it's a one-line change here but a hard one to reverse later.
