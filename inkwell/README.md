# ✍️ InkWell

An open-source e-signature starter. A **sender** prepares a document, adds any
number of **signers**, places fields for each, and sends. Each signer gets their
own private **portal** to complete only their fields. When everyone has signed,
the document is sealed with a tamper-evident **SHA-256** fingerprint and a full
**audit trail**.

> ⚠️ **Demo, not a legal product.** This is a learning/starting scaffold. It is not
> legal advice and the demo is not legally binding. Get a compliance review before
> production use.

## What's inside

```text
inkwell/
├── docs/
│   └── ARCHITECTURE.md
├── frontend/
│   ├── legacy-demo.html # preserved single-file demo for parity checks
│   ├── src/             # React + TypeScript migration target
│   ├── index.html
│   └── package.json
├── server/
│   ├── server.js
│   ├── db.js
│   ├── seal.js
│   └── package.json
└── shared/
  ├── index.d.ts
  ├── index.js
  └── package.json
```

## Quickstart

## Frontend app

```bash
cd frontend
npm install
npm run dev
```

The original demo remains available as `frontend/legacy-demo.html` while React parity work continues.

## Backend API

```bash
cd server
npm install
npm start          # -> InkWell API on http://localhost:3000
```

The server also serves the demo UI at `http://localhost:3000/`.

## API in 60 seconds

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

## How the migration maps to the backend

The legacy demo (`legacy-demo.html`) still holds state in the browser so it works with zero setup.
The new React frontend is the migration target. The backend still implements the same model —
documents, recipients, fields, audit events — behind stable endpoints. Port the UI one surface at a time,
keeping backend route behavior unchanged.

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
