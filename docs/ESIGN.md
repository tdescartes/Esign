# ✍️ Esign

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
frontend/
├── legacy-demo.html # preserved single-file demo for parity checks
├── src/             # React + TypeScript migration target
├── index.html
└── package.json

backend/
├── server.js
├── db.js         # Postgres connection + schema (pg-mem fallback for dev)
├── auth.js       # password hashing, sessions, requireAuth middleware
├── storage.js    # local-disk storage for uploaded/sealed PDFs
├── seal.js       # pdf-lib flatten + hash (falls back to canonical-JSON hash)
├── swagger.js
└── package.json

shared/
├── index.d.ts
├── index.js
└── package.json

docs/
└── ARCHITECTURE.md

docker-compose.yml   # local Postgres for development
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
# optional: start a local Postgres for real persistence
docker compose up -d

cd backend
npm install
cp .env.example .env   # set DATABASE_URL if you started Postgres above
npm start          # -> Esign API on http://localhost:3000
```

If `DATABASE_URL` is not set, the API falls back to an in-memory Postgres-compatible
engine (`pg-mem`) for zero-config local dev — data does not persist across restarts,
so set `DATABASE_URL` for anything beyond a quick trial.

The server also serves the demo UI at `http://localhost:3000/`.

Interactive API documentation is available at `http://localhost:3000/api/docs/`.
The raw OpenAPI specification is available at `http://localhost:3000/api/docs.json`.

## API in 60 seconds

Sender endpoints require an authenticated session; sign up (or log in) first and
reuse the returned session cookie for the following requests.

```bash
# 0) create a sender account (or log in) and keep the session cookie
curl -s localhost:3000/api/auth/signup -c cookies.txt -H 'content-type: application/json' -d '{
  "email": "sender@example.com", "password": "correct horse battery staple"
}'

# 1) create a document with two signers
curl -s localhost:3000/api/documents -b cookies.txt -H 'content-type: application/json' -d '{
  "title": "Agreement",
  "pages": ["<h3>Agreement</h3><p>Terms…</p>", "<p>Signatures</p>"],
  "recipients": [{"name":"Maya Chen","email":"maya@example.com"},
                 {"name":"Sam Okafor","email":"sam@example.com"}]
}'
# -> returns the document with recipient ids

# 2) place a signature field for the first signer  (use ids from step 1)
curl -s localhost:3000/api/documents/DOC_ID/fields -b cookies.txt -H 'content-type: application/json' -d '{
  "recipientId":"REC_ID","type":"signature","page":1,"xPct":12,"yPct":62,"w":190,"h":52
}'

# 2b) optional: attach a real source PDF (flattened + hashed at seal time instead of the HTML preview)
curl -s localhost:3000/api/documents/DOC_ID/file -b cookies.txt -F 'file=@agreement.pdf;type=application/pdf'

# 3) send — mints a token + portal link per signer
curl -s localhost:3000/api/documents/DOC_ID/send -b cookies.txt -X POST
# -> { "links": [ { "recipient":"Maya Chen", "signingUrl":"http://localhost:3000/sign/<token>" }, ... ] }

# 4) a signer fills a field, then completes with consent (no session needed — token-scoped)
curl -s localhost:3000/api/sign/TOKEN/fields/FIELD_ID -H 'content-type: application/json' -d '{"value":"Maya Chen"}'
curl -s localhost:3000/api/sign/TOKEN/complete -H 'content-type: application/json' -d '{"consent":true}'
# when the last signer completes -> document is sealed automatically (real PDF hash if one was uploaded, else canonical-JSON hash)

# 5) sender pulls the certificate + audit trail (and the sealed PDF, if one was uploaded)
curl -s localhost:3000/api/documents/DOC_ID/certificate -b cookies.txt
curl -s localhost:3000/api/documents/DOC_ID/sealed-file -b cookies.txt -o sealed.pdf
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
