# Esign — Architecture

Esign is a small e-signature platform: a **sender** prepares a document, adds
any number of **signers**, places fields for each, and sends. Every signer gets a
private, token-scoped **portal** where they complete only their own fields. When
all signers finish, the document is **sealed** with a SHA-256 fingerprint and a
full **audit trail** is preserved.

## The five parts of any e-signature system

1. **A document that becomes a PDF.** Generated or uploaded — everything normalizes to PDF.
2. **Fields placed at coordinates.** Stored as _normalized_ percentages + a page number, so a field lands correctly at any zoom/screen size.
3. **A signing workflow.** Who signs, in what order, reached via a tokenized link (no login for signers).
4. **An audit trail.** The evidence log — every action, timestamped, with IP and method.
5. **A tamper-evident seal.** A cryptographic hash proving the finished document was not altered.

## Data model

```
documents     id, title, pages, status(draft|sent|completed), sealed_hash, created_at, completed_at
recipients    id, document_id, name, email, color, signing_order, status(draft|sent|viewed|signed), token
fields        id, document_id, recipient_id, type, page, x_pct, y_pct, w, h, required, value, value_meta
audit_events  id, document_id, actor, event, meta, ip, created_at
```

`x_pct`/`y_pct` are 0–100 of the page dimensions — the key trick that keeps a field
in the right place regardless of the device rendering it.

## API surface

| Method & path                           | Who    | Purpose                                                     |
| --------------------------------------- | ------ | ----------------------------------------------------------- |
| `POST /api/documents`                   | sender | Create a draft (optionally with recipients + fields inline) |
| `POST /api/documents/:id/recipients`    | sender | Add a signer                                                |
| `POST /api/documents/:id/fields`        | sender | Place a field for a signer                                  |
| `POST /api/documents/:id/send`          | sender | Mint per-signer tokens, return portal links                 |
| `GET  /api/documents/:id`               | sender | Full document + status dashboard                            |
| `GET  /api/documents/:id/audit`         | sender | Audit trail                                                 |
| `GET  /api/documents/:id/certificate`   | sender | Certificate of completion (after sealing)                   |
| `GET  /api/sign/:token`                 | signer | Open portal — document + this signer's fields               |
| `POST /api/sign/:token/fields/:fieldId` | signer | Save one field value                                        |
| `POST /api/sign/:token/complete`        | signer | Consent + finish; seals if last signer                      |

## Events (webhook points)

`recipient.sent`, `recipient.viewed`, `recipient.signed`, `document.completed`.
Currently logged in `emit()` in `server.js` — wire these to subscriber URLs to let
partner apps react (e.g. activate a contract when it's fully signed).

## The legal backbone

An electronic signature is legally binding (US ESIGN Act / UETA; EU eIDAS) when four
things hold: **intent** (a deliberate signing action), **consent** (agreement to do
business electronically — the checkbox we log), **attribution** (who signed — token,
email, IP), and **integrity** (the SHA-256 seal). The audit trail is what actually
wins disputes: it records who signed, when, from where, and how. `seal.js` handles
integrity; `audit_events` handles the rest.

> This starter gives you the _mechanics_. It is not legal advice, and the demo is not
> a legally binding product. Have a real compliance review before production use,
> especially for regulated documents.

## What's real vs. simulated today

| Piece         | Demo (`index.html`)           | Backend scaffold                 | Production target                                                          |
| ------------- | ----------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| Document      | HTML "pages"                  | HTML pages stored as JSON        | Real PDF via **pdf.js** (render) + **pdf-lib** (flatten values into bytes) |
| Signer access | portal switcher in one window | real per-token endpoints         | tokenized links emailed to each signer's device                            |
| Field values  | in-memory                     | persisted per field              | same                                                                       |
| Integrity     | Web Crypto SHA-256            | Node SHA-256 over canonical JSON | hash the flattened PDF bytes; add a trusted timestamp                      |
| Attribution   | fake IPs                      | request IP captured              | + email/SMS OTP for higher assurance                                       |
| Sender auth   | none                          | none (TODO)                      | real auth/sessions for senders                                             |
| Storage       | none                          | SQLite file                      | Postgres + S3-compatible object storage for PDFs                           |

## Roadmap

- **Phase 1 (here):** core loop — place fields → sign → seal → certificate + audit.
- **Phase 2:** real PDF rendering/flattening; templates + reusable signer roles; email delivery & reminders; sequential signing order (`signing_order` column already present).
- **Phase 3:** the platform layer — sender auth, REST hardening, webhooks to subscribers, and **embedded signing** (drop-in component so partners sign inside their own apps).
- **Phase 4:** document generation (lease/NDA/contractor templates → PDF), bulk send, team roles, branding.
