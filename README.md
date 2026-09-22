# Esign Workspace

This repository treats `inkwell/` as the canonical product root.

## Workspace layout

- `inkwell/frontend`: React frontend and the preserved legacy HTML demo.
- `inkwell/server`: Express API and SQLite-backed signing flow.
- `inkwell/shared`: Shared contract package for frontend and server models.
- `inkwell/docs`: Architecture and product notes.

## Current status

Root-level `server.js`, `index.html`, and `ARCHITECTURE.md` are legacy duplicates from early scaffolding. They are preserved temporarily for reference only; all active work should happen inside `inkwell/`.

## Workspace commands

Run commands from the repository root:

```bash
npm install
npm run dev:api
npm run dev:web
```

For product details and implementation notes, see `inkwell/README.md`.

```bash
# 1) create a document with two signers
curl -s localhost:3000/api/documents -H 'content-type: application/json' -d '{
  "title": "Agreement",
  "pages": ["<h3>Agreement</h3><p>Terms…</p>", "<p>Signatures</p>"],
  "recipients": [{"name":"Maya Chen","email":"maya@example.com"},
                 {"name":"Sam Okafor","email":"sam@example.com"}]
}'
# -> returns the document with recipient ids

# 2) place a signature field for the first signer  (use ids from step 1)
curl -s localhost:3000/api/documents/DOC_ID/fields -H 'content-type: application/json' -d '{
  "recipientId":"REC_ID","type":"signature","page":1,"xPct":12,"yPct":62,"w":190,"h":52
}'

# 3) send — mints a token + portal link per signer
curl -s localhost:3000/api/documents/DOC_ID/send -X POST
# -> { "links": [ { "recipient":"Maya Chen", "signingUrl":"http://localhost:3000/sign/<token>" }, ... ] }

# 4) a signer fills a field, then completes with consent
curl -s localhost:3000/api/sign/TOKEN/fields/FIELD_ID -H 'content-type: application/json' -d '{"value":"Maya Chen"}'
curl -s localhost:3000/api/sign/TOKEN/complete -H 'content-type: application/json' -d '{"consent":true}'
# when the last signer completes -> document is sealed (SHA-256) automatically

# 5) sender pulls the certificate + audit trail
curl -s localhost:3000/api/documents/DOC_ID/certificate
```

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
