# InkWell — Implementation Plan & Product Specification

> **Status:** Living spec for taking InkWell from working demo → production e-signature platform.
> **Audience:** Human developers and AI coding agents.
> **Not legal advice.** The compliance sections describe engineering requirements, not counsel. Get a lawyer's review before production use with real signers.

---

## 0. How to use this document

- Work is organized into **epics** (`E1…E16`), each broken into checkbox **tasks** with **acceptance criteria**.
- Priorities: **P0** = MVP / must-have, **P1** = important next, **P2** = later.
- Every epic maps to a **phase** in [§13 Roadmap](#13-delivery-roadmap). Build in phase order.
- Pair this with the repo's `copilot-instructions.md` so agents keep the core invariants (below) on every task.

### Core invariants (never violate)
1. **Field positions are normalized** (0–100% of page + page index), never raw pixels.
2. **The audit log is append-only.** Never update or delete an `audit_events` row.
3. **Signer access is token-scoped.** A signer can only ever read/write their own document + fields.
4. **Never weaken the seal.** The SHA-256 is computed over canonical, sorted content; changing the canonicalization is a breaking, security-relevant change.
5. **Every state transition writes an audit event** (created, sent, viewed, signed, consented, completed, declined, voided).

---

## 1. Product overview

**Vision.** An open-source e-signature platform that any business or developer can self-host or embed: prepare a document, add signers, place fields, send, and collect legally-defensible electronic signatures — with a clean API so it can be plugged into other products.

**Target users**
- **Senders** — rental companies, contractors, small businesses, HR, agencies sending agreements.
- **Signers** — anyone receiving a document to sign; no account required.
- **Developers/integrators** — teams embedding signing into their own apps via API + embedded component.
- **Org admins** — manage team, branding, templates, billing (if hosted).
- **Self-hosters** — run the whole thing on their own infra.

**Core value prop:** simple, legally-sound signing + a first-class API and embeddable signing, openly licensed.

**Non-goals for v1 (explicitly out of scope)**
- Qualified Electronic Signatures (QES) / notarization / identity-proofing to eIDAS "qualified" level.
- Payments/billing collection inside signed docs.
- Real-time multi-user co-editing of the document body.
- Mobile native apps (web is responsive instead).

---

## 2. Current state (baseline already built)

| Piece | Exists today | Notes |
|---|---|---|
| Frontend demo | `frontend/index.html` | Self-contained, in-memory. Sender + per-signer portals, field placement, signature capture, seal, certificate. |
| API scaffold | `server/server.js` (Express) | Sender + token-scoped signer endpoints; send/sign/seal loop tested end-to-end. |
| DB | `server/db.js` (SQLite) | `documents`, `recipients`, `fields`, `audit_events`. |
| Sealing | `server/seal.js` | Canonical JSON + SHA-256. |
| API client stub | `frontend/api-client.js` | Fetch wrappers mapping to endpoints. |

**Simulated today (to make real):** real PDF rendering/flattening (HTML pages stand in), signer links live in one browser window, fake IPs, no sender auth, no email, SQLite not Postgres.

---

## 3. Personas & user stories

### 3.1 Sender (business user)
- As a sender, I can create an account and sign in, so my documents are private to me.
- As a sender, I can upload a PDF **or** start from a template, so I can prepare any document.
- As a sender, I can add one or more signers with names/emails, so each gets their own portal.
- As a sender, I can drag signature/date/text/etc. fields onto the document and assign each to a signer.
- As a sender, I can set signing order (parallel or sequential), so signatures are collected correctly.
- As a sender, I can send the document and have each signer emailed their private link.
- As a sender, I can watch real-time status (sent/viewed/signed) per signer on a dashboard.
- As a sender, I can send reminders, set an expiration, and void a document before completion.
- As a sender, I can download the completed, sealed PDF + certificate of completion.
- As a sender, I can save a prepared document as a reusable template.

### 3.2 Signer (recipient)
- As a signer, I can open my private link without creating an account.
- As a signer, I must give explicit consent to sign electronically before I can sign.
- As a signer, I can see the full document and complete only my assigned fields.
- As a signer, I can draw, type, or upload my signature.
- As a signer, I can decline to sign with a reason.
- As a signer, I receive a copy of the completed document.
- As a signer with a higher-assurance document, I must enter an emailed/SMS code to access it.

### 3.3 Developer / integrator
- As a developer, I can create an API key with scopes.
- As a developer, I can create + send a document entirely via REST.
- As a developer, I can create a document from a template and prefill field values in one call.
- As a developer, I can subscribe to webhooks and reliably receive signing events.
- As a developer, I can embed signing inside my own app via a session token + component, without redirecting my users away.

### 3.4 Organization admin
- As an admin, I can invite teammates and assign roles (owner/admin/member/viewer).
- As an admin, I can set org branding (logo, colors) shown on signing pages and emails.
- As an admin, I can manage shared templates and view all org documents.

### 3.5 Self-hoster / platform admin
- As a self-hoster, I can deploy with documented env vars and run DB migrations.
- As a self-hoster, I can configure the email provider, object storage, and base URL.
- As a platform admin, I can view system health and audit auth events.

---

## 4. System architecture

### 4.1 Components
- **Web app (SPA):** React + TypeScript (Vite). Sender console + signer portal.
- **API service:** Node + TypeScript + Express (evolve current scaffold). REST + webhooks. Stateless.
- **Database:** PostgreSQL (migrate from SQLite; schema maps 1:1).
- **Object storage:** S3-compatible (documents, flattened PDFs, uploaded signatures).
- **Background worker + queue:** for email sending, reminders, webhook delivery/retries (e.g. BullMQ + Redis, or a DB-backed queue to stay dependency-light).
- **Email provider:** transactional email (Resend/SendGrid/SES) via adapter interface.
- **Cache/session store:** Redis (optional; sessions can be DB-backed initially).

### 4.2 Tech stack summary
| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + TS + Vite | Complex editor state; contributor-friendly; embeddable path. |
| Styling | Tailwind or CSS modules | Team preference. |
| PDF render | pdf.js | Display PDF pages in the editor + signer view. |
| PDF write | pdf-lib | Flatten field values into PDF bytes at seal time. |
| Backend | Node + TS + Express | Reuse existing API; API-first. |
| ORM/migrations | Prisma or Drizzle | Type-safe schema + migrations. |
| Auth | Lucia/Auth.js or hand-rolled sessions + argon2 | See §6. |
| Queue | BullMQ + Redis (or pg-boss) | Email/webhook reliability. |
| Tests | Vitest + Playwright | Units + e2e signing flows. |

### 4.3 Key data flows
1. **Prepare → send:** sender creates document, uploads/renders PDF, places fields, adds recipients, clicks send → tokens minted, emails queued, status `sent`, audit events written.
2. **Sign:** signer opens token link → `viewed` → consents → fills fields (autosaved) → completes → `signed`. When all signed → seal.
3. **Seal:** flatten values into PDF via pdf-lib → hash bytes → store sealed PDF + certificate → `completed` → emit `document.completed` webhook → email copies.

---

## 5. Data model (PostgreSQL)

> Existing tables evolve; new tables added for auth, orgs, templates, webhooks, files. Use UUID primary keys and `created_at`/`updated_at` timestamps everywhere. All FKs `ON DELETE CASCADE` unless noted.

### 5.1 Identity & tenancy
```
organizations       id, name, slug, logo_url, brand_color, plan, created_at
users               id, email(unique, citext), name, password_hash, email_verified_at,
                    mfa_secret, mfa_enabled, created_at, last_login_at
memberships         id, org_id→organizations, user_id→users, role(owner|admin|member|viewer),
                    created_at   (unique org_id+user_id)
sessions            id, user_id→users, token_hash(unique), user_agent, ip,
                    expires_at, created_at, revoked_at
email_verifications id, user_id, token_hash, expires_at, consumed_at
password_resets     id, user_id, token_hash, expires_at, consumed_at
api_keys            id, org_id→organizations, name, key_hash(unique), prefix,
                    scopes(text[]), last_used_at, expires_at, revoked_at, created_at
```

### 5.2 Documents (evolve existing)
```
documents      id, org_id→organizations, created_by→users, title,
               source_file_id→files, page_count, status(draft|sent|completed|declined|voided),
               signing_order(parallel|sequential), sealed_file_id→files, sealed_hash,
               expires_at, message, created_at, sent_at, completed_at, voided_at
recipients     id, document_id→documents, name, email, role_label, color,
               signing_order(int), status(draft|sent|viewed|signed|declined),
               token_hash(unique), access_code_hash, auth_method(link|email_otp|sms_otp),
               viewed_at, signed_at, declined_reason, created_at
fields         id, document_id→documents, recipient_id→recipients, type, page,
               x_pct, y_pct, w, h, required, placeholder, value, value_meta(jsonb), created_at
consents       id, document_id, recipient_id, text_shown, ip, user_agent, created_at
audit_events   id, document_id, actor, event, meta, ip, user_agent, created_at   -- APPEND ONLY
```
> **Security:** store only `token_hash` (hash the raw token); the raw token exists only in the emailed URL. Same for API keys and access codes.

### 5.3 Files
```
files    id, org_id, kind(upload|sealed|signature_asset|certificate),
         storage_key, mime, size_bytes, sha256, created_at
```

### 5.4 Templates
```
templates        id, org_id, created_by, name, description, source_file_id→files,
                 page_count, created_at, updated_at
template_roles   id, template_id, role_label, color, signing_order
template_fields  id, template_id, template_role_id, type, page, x_pct, y_pct, w, h,
                 required, placeholder
```

### 5.5 Webhooks & delivery
```
webhook_endpoints   id, org_id, url, secret, events(text[]), active, created_at
webhook_deliveries  id, endpoint_id, event, payload(jsonb), status(pending|success|failed),
                    attempts, next_retry_at, response_code, created_at, delivered_at
```

### 5.6 Notifications
```
email_log    id, document_id, recipient_id, template(invite|reminder|completed|copy),
             to_email, status, provider_id, error, created_at
reminders    id, document_id, recipient_id, scheduled_at, sent_at, cadence
```

### 5.7 Migration approach
> **Implemented (this pass):** the API now runs on Postgres via `pg`, with an in-memory pg-mem fallback for zero-config dev/tests (see `backend/db.js`). Schema is applied as idempotent `CREATE TABLE IF NOT EXISTS` on boot rather than through a generated migration, to match this codebase's existing raw-SQL style. `users`, `sessions`, and `consents` tables were added; a full `organizations`/`memberships` model was intentionally deferred (see §6.6 note).
- [ ] **[P0]** Introduce ORM (Prisma/Drizzle) and generate initial migration matching current SQLite schema. *(deferred — using raw `pg` + idempotent DDL instead; revisit if migration history/rollback tooling becomes necessary)*
- [ ] **[P0]** Add auth + org tables; backfill a default org per user. *(auth tables done; org tables deferred)*
- [ ] **[P1]** Add templates, webhooks, files, notifications tables.
- [ ] Provide `seed` script with a demo org, user, template.

---

## 6. Authentication & authorization

### 6.1 Sender / user authentication `[P0]`
> **Implemented (this pass):** email/password signup + login, httpOnly session cookie, logout/revoke, `/api/me`. Password hashing uses **bcryptjs** (cost 12) rather than argon2id, to avoid native-build risk in this environment — still salted and cost-factored; swap to argon2id if that's a hard requirement. Email verification, password reset, MFA, and rate limiting are **not** implemented yet.
- [x] Email + password signup; hash with **argon2id** (never bcrypt-with-low-cost, never plaintext). *(bcryptjs cost-12 used instead of argon2id — see note above)*
- [ ] Email verification required before sending documents.
- [x] Login issues a **session** (opaque token, stored hashed) in an **httpOnly, Secure, SameSite=Lax cookie**.
- [x] Logout revokes the session; "log out everywhere" revokes all. *(single-session revoke only; "everywhere" not implemented)*
- [ ] Password reset via single-use, expiring, hashed token.
- [ ] Rate-limit login + reset endpoints; lockout/backoff on repeated failures.
- **Acceptance:** a user can sign up, verify email, log in, reset password; sessions expire and can be revoked; no secret is ever stored in plaintext.

### 6.2 OAuth (social login) `[P1]`
- [ ] Google + GitHub OAuth; link to existing account by verified email.

### 6.3 MFA `[P1]`
- [ ] TOTP enrollment (authenticator app) + recovery codes; enforce on login when enabled.

### 6.4 API authentication `[P0]`
- [ ] API keys scoped to an org, shown once at creation, stored as hash with a visible prefix.
- [ ] **Scopes:** `documents:read`, `documents:write`, `templates:read`, `templates:write`, `webhooks:manage`, `embedded:create`.
- [ ] Per-key **rate limiting** and `last_used_at` tracking; keys revocable + expirable.
- **Acceptance:** requests authenticate via `Authorization: Bearer <key>`; missing scope → 403; revoked key → 401.

### 6.5 Signer authentication (token portals) `[P0]`
> **Known gap surfaced by this pass:** recipient signing tokens are still stored in plaintext in `recipients.token` (pre-existing behavior, unchanged here). Session tokens added in this pass ARE hashed before storage (§6.1). Recommend hashing recipient tokens the same way in a follow-up.
- [ ] Signing links carry a high-entropy token (≥ 24 random bytes); only the **hash** is stored. *(token is high-entropy via `randomBytes(24)`, but stored in plaintext, not hashed)*
- [ ] Tokens **expire** (document `expires_at`) and are **single-recipient scoped**.
- [ ] Optional step-up: **email OTP** `[P0]` / **SMS OTP** `[P2]` / **access code** `[P1]` before document access.
- [ ] Token can be **revoked/reissued** if resent.
- **Acceptance:** a signer with a valid token sees only their document + their fields; expired/revoked/invalid tokens are rejected; step-up (when configured) is enforced and logged.

### 6.6 Authorization model `[P0]`
> **Implemented (this pass):** documents are owner-scoped (`documents.owner_id`) and every sender endpoint requires an authenticated session and checks ownership, returning 404 (not 403) for another user's document to avoid confirming existence. A full org/membership/role model (owner/admin/member/viewer) was **not** implemented — this is single-user ownership, not multi-tenant orgs.
- [ ] **Multi-tenancy:** every document/template/key belongs to an org; all queries scoped by org. *(implemented as per-user ownership instead of org-level tenancy; see note above)*
- [ ] **Roles:** owner/admin/member/viewer with a permission matrix (create/send/void/manage-team/manage-billing/manage-templates).
- [x] **Resource ownership checks** on every sender endpoint (403 across orgs). *(returns 404 across owners, a stricter choice than 403)*
- [ ] Audit all auth events (login, key created/revoked, role changes).
- **Acceptance:** a user in org A can never read/act on org B's resources by any endpoint.

---

## 7. Feature epics

### E1 — Document creation & upload `[P0]` (Phase 1)
> **Implemented (this pass):** `POST /api/documents/:id/file` validates MIME type + size, extracts page count with pdf-lib, and stores the PDF (local disk, not yet object storage). The HTML-page demo path still works unchanged when no PDF is uploaded.
- [ ] Upload a PDF (validate type/size); store in object storage; record `files` + `documents`. *(stored on local disk, not object storage; see `backend/storage.js`)*
- [ ] Extract `page_count`; generate page render assets or render client-side. *(page_count extraction done; render assets/client-side rendering deferred — see E2)*
- [ ] (Later, E16) Generate a PDF from a template document.
- **Acceptance:** a sender can upload a multi-page PDF and see it rendered in the editor.

### E2 — PDF rendering & field placement `[P0]` (Phase 1)
> **Deferred (this pass):** the editor still previews the HTML-page demo content; it does not yet render the uploaded PDF's real pages with pdf.js. Field placement continues to use the existing normalized xPct/yPct model, which is already compatible with a future pdf.js canvas — this is the next slice.
- [ ] Render PDF pages with **pdf.js** in the editor and signer view.
- [ ] Field palette: signature, initials, name, date, text, checkbox (extensible: email, dropdown, radio, attachment).
- [ ] Place, **drag-to-reposition**, **resize**, and delete fields; store normalized coords.
- [ ] Assign each field to a recipient; color-code by recipient.
- [ ] Required/optional toggle; placeholder text.
- **Acceptance:** fields land at correct positions across zoom/screen sizes and persist to the API.

### E3 — Recipients & routing `[P0]` (Phase 1–2)
- [ ] Add/edit/remove recipients (name, email, role label).
- [ ] **Parallel** (P0) and **sequential** (P1) signing order; sequential unlocks next signer on completion.
- [ ] CC-only recipients (receive copy, no fields) `[P2]`.
- **Acceptance:** sequential documents only expose signer N's portal after signer N-1 completes.

### E4 — Sending & lifecycle `[P0]` (Phase 2)
- [ ] Send action: mint tokens, queue invite emails, set `sent`, write audit.
- [ ] **Reminders** (manual + scheduled cadence) `[P1]`.
- [ ] **Expiration** with auto-void `[P1]`.
- [ ] **Void** an in-flight document with reason `[P0]`.
- **Acceptance:** each signer receives an email with a working private link; voided docs can no longer be signed.

### E5 — Signing experience / portals `[P0]` (Phase 1–2)
> **Implemented (this pass):** consent is now recorded in a dedicated `consents` table (text shown, IP, user agent, timestamp) in addition to the existing audit event.
- [ ] Token portal renders the document + this signer's fields; others locked.
- [x] **Explicit e-sign consent** gate (record `consents` with text shown, IP, UA).
- [ ] Autosave field values as the signer works.
- [ ] Signature capture: **draw** (canvas), **type** (styled), **upload** image.
- [ ] **Decline to sign** with reason `[P1]`.
- [ ] Mobile-responsive, keyboard-accessible.
- **Acceptance:** a signer completes required fields, consents, and finishes; declining stops the flow and notifies the sender.

### E6 — Sealing & integrity `[P0]` (Phase 2)
> **Implemented (this pass):** when a source PDF was uploaded, sealing now flattens every signer's field values into the real PDF with pdf-lib (text via `drawText`, signatures/images via `embedPng`/`embedJpg`) and hashes the resulting bytes — see `backend/seal.js`. When no source PDF is present, the previous canonical-JSON hash behavior is preserved unchanged. The certificate is still a JSON response, not a bundled PDF, and there is no trusted timestamp yet.
- [x] On last signature, **flatten** all values into the PDF with **pdf-lib**. *(only when a source PDF was uploaded; falls back to canonical-JSON hashing otherwise)*
- [x] Hash the **flattened PDF bytes** (SHA-256); store `sealed_hash` + sealed file.
- [ ] Generate a **certificate of completion** PDF (parties, timestamps, IPs, auth method, hash) and append/bundle it.
- [ ] Add a trusted **timestamp** `[P2]` (RFC 3161 TSA) for stronger evidence.
- **Acceptance:** the sealed PDF downloads, contains all values, and its hash matches the stored hash; re-hash detects any tampering.

### E7 — Audit trail & evidence `[P0]` (Phase 1)
- [ ] Append-only events for every lifecycle action with actor, timestamp, IP, UA.
- [ ] Sender-visible audit view + inclusion in the certificate.
- **Acceptance:** every state change appears exactly once, in order, and is immutable.

### E8 — Templates & reusable roles `[P1]` (Phase 3)
- [ ] Save a prepared document (fields + roles) as a template.
- [ ] Create a document from a template; map roles → actual recipients; prefill field values.
- **Acceptance:** a sender/developer can send a personalized copy from a template in one action/call.

### E9 — Bulk send `[P2]` (Phase 4)
- [ ] Upload a CSV of recipients against a template; generate one envelope per row.
- **Acceptance:** N documents are created and sent from one CSV; per-row errors are reported.

### E10 — Dashboard & document management `[P0/P1]` (Phase 2–3)
- [ ] List documents with status, search, filter, sort, pagination.
- [ ] Detail view: recipients, progress, audit, download.
- [ ] Archive/delete (respecting retention) `[P1]`.
- **Acceptance:** a sender finds and inspects any of their documents quickly.

### E11 — Notifications `[P0/P1]` (Phase 2)
- [ ] Transactional emails: invite, reminder, completed (+ signed copy), declined, voided.
- [ ] Branded, templated, localizable; delivery logged; provider via adapter interface.
- **Acceptance:** each lifecycle event sends the correct email; failures are logged and retried.

### E12 — Public API & webhooks `[P0/P1]` (Phase 3)
- [ ] Versioned REST (`/v1`) covering documents, recipients, fields, send, templates, signing.
- [ ] Webhook endpoints CRUD; **signed** payloads (HMAC), **retries** with backoff, delivery log.
- [ ] Events: `document.sent|viewed|completed|declined|voided`, `recipient.viewed|signed`.
- [ ] OpenAPI spec + generated docs.
- **Acceptance:** an external app can run the full lifecycle via API and receive verified webhooks reliably.

### E13 — Embedded signing `[P1]` (Phase 3)
- [ ] Create short-lived **embedded signing session** tokens via API.
- [ ] Drop-in component / iframe that hosts the signing UI inside a partner app.
- [ ] `postMessage` events (completed/declined) back to the host.
- **Acceptance:** a partner embeds signing without redirecting users off their domain; completion is reported to the host.

### E14 — Organizations, teams, branding `[P1]` (Phase 3–4)
- [ ] Invite members, assign roles; shared templates + org document visibility.
- [ ] Org branding (logo/colors) on signing pages + emails.
- **Acceptance:** teammates collaborate under one org with correct permissions and branding.

### E15 — Settings & admin `[P1]` (Phase 4)
- [ ] User profile, security (sessions/MFA), org settings, API keys, webhook management UIs.

### E16 — Document generation library `[P2]` (Phase 5)
- [ ] Fill-in templates (lease, NDA, contractor agreement) → generated PDF → into the signing flow.

---

## 8. API specification (v1 outline)

**Conventions:** JSON; `Authorization: Bearer <api_key|session>`; cursor pagination; consistent error shape `{ error: { code, message, details } }`; **idempotency keys** on POST; rate limits per key.

**Auth & account**
```
POST   /v1/auth/signup            POST /v1/auth/login       POST /v1/auth/logout
POST   /v1/auth/verify-email      POST /v1/auth/reset       POST /v1/auth/reset/confirm
GET    /v1/me                     POST /v1/api-keys         DELETE /v1/api-keys/:id
```
**Documents (sender)**
```
POST   /v1/documents                       GET  /v1/documents            GET /v1/documents/:id
POST   /v1/documents/:id/recipients        POST /v1/documents/:id/fields
POST   /v1/documents/:id/send              POST /v1/documents/:id/void
GET    /v1/documents/:id/audit             GET  /v1/documents/:id/certificate
GET    /v1/documents/:id/download          POST /v1/documents/:id/reminders
```
**Signing (token-scoped, no account)**
```
GET    /v1/sign/:token                      POST /v1/sign/:token/verify   (OTP/access code)
POST   /v1/sign/:token/fields/:fieldId      POST /v1/sign/:token/complete
POST   /v1/sign/:token/decline
```
**Templates**
```
POST /v1/templates   GET /v1/templates   GET /v1/templates/:id
POST /v1/templates/:id/create-document     (map roles→recipients, prefill values)
```
**Webhooks & embedded**
```
POST /v1/webhooks   GET /v1/webhooks   DELETE /v1/webhooks/:id
POST /v1/embedded/sessions                 (returns short-lived embed token)
```

---

## 9. Compliance & legal requirements

> Engineering requirements to make signatures defensible. **Not legal advice.**

### 9.1 ESIGN / UETA (US) — the four pillars → features
- **Intent to sign:** deliberate signing action + explicit "Sign" step (E5).
- **Consent to do business electronically:** recorded consent with disclosure text, IP, timestamp (`consents`).
- **Attribution:** token access + email; optional OTP/access code; captured IP/UA (§6.5, E7).
- **Integrity:** flatten + SHA-256 seal + certificate (+ optional RFC-3161 timestamp) (E6).
- **Retention & reproducibility:** store the sealed PDF + certificate durably; allow re-download by all parties.

### 9.2 eIDAS (EU) — scope decision `[decision]`
- v1 targets **SES** (Simple Electronic Signature). **AES/QES** (certificates, QTSP, identity proofing) are **out of scope** for v1 — document this clearly. Revisit if EU enterprise demand appears.

### 9.3 Data protection (GDPR/CCPA) `[P1]`
- [ ] Lawful basis + privacy policy; DPA for hosted offering.
- [ ] **Data subject requests:** export + delete a person's data (respecting legal retention of completed records).
- [ ] Configurable **data residency** / storage region for self-hosters.
- [ ] PII minimization; encrypt at rest; scrub logs of secrets/PII.

### 9.4 Records
- [ ] Retention policy config; completed documents immutable; deletion audited.

---

## 10. Non-functional requirements

**Security `[P0]`**
- [ ] OWASP Top 10 review; input validation everywhere; parameterized queries.
- [ ] TLS in transit; encryption at rest (DB + object storage).
- [ ] Secrets via env/secret manager; never in repo.
- [ ] CSRF protection on cookie-auth routes; strict CSP; security headers (helmet).
- [ ] Rate limiting + abuse protection on auth, signing, and API.
- [ ] Dependency scanning (Dependabot) + SAST in CI.
- [ ] Signed webhook payloads; verify on receipt.

**Privacy `[P1]`** — PII inventory; retention; DSR tooling (see §9.3).

**Performance `[P1]`** — editor interactions < 100ms; API p95 < 300ms (excl. PDF ops); PDF seal handled async for large files.

**Reliability `[P0/P1]`** — DB backups + tested restore; idempotent webhook delivery with retries; queue for email/seal so a provider outage doesn't lose events.

**Accessibility `[P0]`** — signing pages meet **WCAG 2.1 AA** (keyboard, screen-reader labels, contrast) — signers are the public.

**Internationalization `[P1]`** — externalize UI strings + email templates; date/locale formatting.

**Observability `[P0/P1]`** — structured logs, request tracing, metrics, error tracking (Sentry); audit log distinct from app logs.

---

## 11. Testing strategy

- [ ] **Unit `[P0]`:** `seal.js` canonicalization/hash; coordinate math; auth (hashing, token validation); permission checks.
- [ ] **Integration `[P0]`:** every API endpoint incl. authz (cross-org 403), token scoping, consent enforcement.
- [ ] **E2E `[P0]` (Playwright):** full send→sign→seal for parallel + sequential; decline; void; expired token; OTP step-up.
- [ ] **Security `[P1]`:** authz fuzzing, rate-limit checks, webhook signature verification, dependency audit.
- [ ] **Load `[P2]`:** concurrent signings; large PDF sealing.
- [ ] Deterministic seed data + factories; CI runs unit+integration on every PR, e2e on merge.

---

## 12. DevOps & deployment

- [ ] **Repo:** monorepo (`/web`, `/api`, `/packages/shared-types`, `/docs`) or keep `frontend`/`server` split; share TS types across the wire.
- [ ] **CI/CD:** lint + typecheck + test on PR; build + migrate + deploy on merge.
- [ ] **Migrations:** run automatically on deploy; never destructive without a backup step.
- [ ] **Config:** all via env; provide `.env.example`; validate env at boot.
- [ ] **Docker:** `docker-compose` (api, web, postgres, redis, minio) for one-command local + self-host.
- [ ] **Self-host guide:** required env, storage, email provider, base URL, first-run admin.
- [ ] **Hosting:** containers on any provider; object storage S3-compatible; managed Postgres.

---

## 13. Delivery roadmap

### Phase 1 — Real core loop (foundations)
**Epics:** E1, E2, E5 (consent+capture), E7 + auth §6.1/§6.5 minimal + DB migration to Postgres.
**Done when:** a logged-in sender uploads a real PDF, places fields, a token signer completes, and events are logged. *(Sealing can still be interim.)*

### Phase 2 — Sealing, lifecycle & notifications
**Epics:** E6 (flatten+hash+certificate), E4 (send/void/reminders), E11 (emails), E3 sequential, E10 (dashboard basics).
**Done when:** real emailed links; documents seal into downloadable PDFs with certificates; senders track status.

### Phase 3 — Platform: API, webhooks, templates, embedding, orgs
**Epics:** E12, E8, E13, E14, full §6.4 API keys + §6.6 authz.
**Done when:** an external app runs the whole lifecycle via API, receives verified webhooks, and can embed signing.

### Phase 4 — Team, admin, scale, bulk
**Epics:** E9, E14/E15 polish, MFA/OAuth, i18n, hardening, load testing.

### Phase 5 — Document generation library
**Epic:** E16 (lease/NDA/contractor generators) feeding the signing flow.

---

## 14. Risks & open decisions

| Decision | Options | Notes |
|---|---|---|
| **License** | MIT vs AGPL-3.0 | MIT = friendliest for embedders (your goal); AGPL = protects commons (peers use it). Decide before public release. |
| eIDAS scope | SES only vs AES/QES later | v1 = SES; document the boundary. |
| Queue/infra | Redis+BullMQ vs pg-boss | pg-boss avoids a Redis dependency for small self-hosts. |
| Email provider | SES/Resend/SendGrid | Adapter interface so self-hosters swap. |
| SMS OTP | Twilio etc. | Adds cost + provider dependency; keep P2/optional. |
| Storage | S3 vs MinIO (self-host) | Support both via S3 API. |
| Timestamping | Add RFC-3161 TSA? | Stronger evidence; P2. |

---

## 15. Glossary

- **Envelope/Document** — the thing being signed (PDF + fields + recipients).
- **Recipient/Signer** — a party assigned fields; accesses via token portal.
- **Field** — a placed input (signature/date/text/…) with normalized coordinates.
- **Seal** — flatten values into PDF bytes + SHA-256 fingerprint.
- **Certificate of completion** — evidence summary (parties, times, IPs, hash).
- **Audit trail** — append-only lifecycle event log.
- **SES/AES/QES** — eIDAS signature assurance levels (simple/advanced/qualified).

---

*End of spec. Keep this file in the repo (e.g. `docs/IMPLEMENTATION_PLAN.md`) and update checkboxes as work lands.*
