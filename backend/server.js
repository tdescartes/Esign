// server.js — Esign API.
//
// Mirrors the demo's model exactly:
//   sender  -> signs in, creates a document, adds recipients (signers), places fields, sends
//   signer  -> opens their private token portal, fills only their fields, consents, finishes
//   system  -> when every signer has signed, seals the document (SHA-256 over a real PDF
//              when one was uploaded) + writes audit
//
// Everything a court would want lives in audit_events. Run: npm install && npm start

import express from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cookieParser from "cookie-parser";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import { PDFDocument } from "pdf-lib";
import { pool } from "./db.js";
import { sealDocument } from "./seal.js";
import { openApiSpecification } from "./swagger.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  revokeSession,
  hashPassword,
  verifyPassword,
  requireAuth,
} from "./auth.js";
import { saveSourceFile, readFileBytes } from "./storage.js";

export const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(serverDir, "..", "frontend");
const COLORS = [
  "#0f9d6b",
  "#2563eb",
  "#c2410c",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4d7c0f",
  "#b45309",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const CONSENT_DISCLOSURE_TEXT =
  "I agree to sign this document electronically and acknowledge that my electronic signature is legally binding to the same extent as a handwritten signature, consistent with the U.S. ESIGN Act and UETA.";

// Wraps an async route handler so a rejected promise reaches Express's error
// middleware instead of hanging the request (Express 4 does not do this itself).
const ah = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.use(express.json({ limit: "8mb" })); // roomy for drawn-signature data-URIs
app.use(cookieParser());
app.use(express.static(frontendDir)); // serve the demo UI at /

app.get("/api/docs.json", (_req, res) => {
  res.json(openApiSpecification);
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpecification));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "esign-api" });
});

// Reflects the request origin (rather than "*") so credentialed cookie
// requests work cross-origin in dev. Lock this to a known allowlist in production.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- helpers ----
const now = () => new Date().toISOString();
const ipOf = (req) =>
  (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
const userAgentOf = (req) => req.headers["user-agent"] || null;

async function audit(documentId, actor, event, meta, ip) {
  await pool.query(
    `INSERT INTO audit_events (id,document_id,actor,event,meta,ip,created_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), documentId, actor, event, meta || null, ip || null, now()]
  );
}

// Stub webhook emitter. In production, look up subscriber URLs for this document's
// owner and POST the event. Kept as a log so the integration point is obvious.
function emit(event, payload) {
  console.log(`[webhook] ${event}`, JSON.stringify(payload));
  // Webhook delivery is intentionally not implemented in this scaffold.
}

async function getDoc(id) {
  const { rows } = await pool.query("SELECT * FROM documents WHERE id=$1", [id]);
  return rows[0] || null;
}
async function getOwnedDoc(id, ownerId) {
  const { rows } = await pool.query(
    "SELECT * FROM documents WHERE id=$1 AND owner_id=$2",
    [id, ownerId]
  );
  return rows[0] || null;
}
async function getByTok(token) {
  const { rows } = await pool.query("SELECT * FROM recipients WHERE token=$1", [
    token,
  ]);
  return rows[0] || null;
}
async function recipientsOf(id) {
  const { rows } = await pool.query(
    "SELECT * FROM recipients WHERE document_id=$1 ORDER BY signing_order, created_at",
    [id]
  );
  return rows;
}
async function fieldsOf(id) {
  const { rows } = await pool.query("SELECT * FROM fields WHERE document_id=$1", [
    id,
  ]);
  return rows;
}

// =====================================================================
// AUTH (minimal sender authentication — email/password + session cookie)
// =====================================================================

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

app.post(
  "/api/auth/signup",
  ah(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || password.length < 8) {
      return res
        .status(400)
        .json({ error: "email and an 8+ character password are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [normalizedEmail]
    );
    if (existing.length) {
      return res
        .status(409)
        .json({ error: "an account with that email already exists" });
    }
    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    await pool.query(
      "INSERT INTO users (id,email,name,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)",
      [id, normalizedEmail, name || null, passwordHash, now()]
    );
    const { token } = await createSession(id);
    setSessionCookie(res, token);
    res.status(201).json({ id, email: normalizedEmail, name: name || null });
  })
);

app.post(
  "/api/auth/login",
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
      normalizedEmail,
    ]);
    const user = rows[0];
    const validPassword = user
      ? await verifyPassword(password, user.password_hash)
      : false;
    if (!user || !validPassword) {
      return res.status(401).json({ error: "invalid email or password" });
    }
    const { token } = await createSession(user.id);
    setSessionCookie(res, token);
    res.json({ id: user.id, email: user.email, name: user.name });
  })
);

app.post(
  "/api/auth/logout",
  ah(async (req, res) => {
    await revokeSession(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  })
);

app.get("/api/me", requireAuth(), (req, res) => {
  res.json(req.user);
});

// =====================================================================
// SENDER SIDE (requires an authenticated session; documents are owner-scoped)
// =====================================================================

// Create a document (draft). Optionally include recipients + fields inline.
app.post(
  "/api/documents",
  requireAuth(),
  ah(async (req, res) => {
    const {
      title = "Untitled",
      pages = [],
      recipients = [],
      fields = [],
    } = req.body;
    const id = randomUUID();
    await pool.query(
      `INSERT INTO documents (id,owner_id,title,pages,status,page_count,created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.user.id, title, JSON.stringify(pages), "draft", pages.length, now()]
    );
    await audit(id, "sender", "created", title);

    const recIdByIndex = {};
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const rid = randomUUID();
      recIdByIndex[i] = rid;
      await pool.query(
        `INSERT INTO recipients (id,document_id,name,email,color,signing_order,status,created_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          rid,
          id,
          r.name || `Signer ${i + 1}`,
          r.email || null,
          r.color || COLORS[i % COLORS.length],
          r.signingOrder || 0,
          "draft",
          now(),
        ]
      );
    }
    for (const f of fields) {
      await insertField(id, f.recipientId ?? recIdByIndex[f.recipientIndex], f);
    }

    res.status(201).json(await fullDocument(id));
  })
);

// Add one recipient (signer) to a draft document.
app.post(
  "/api/documents/:id/recipients",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    const count = (await recipientsOf(doc.id)).length;
    const { name, email, signingOrder = 0 } = req.body;
    const rid = randomUUID();
    await pool.query(
      `INSERT INTO recipients (id,document_id,name,email,color,signing_order,status,created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        rid,
        doc.id,
        name || `Signer ${count + 1}`,
        email || null,
        COLORS[count % COLORS.length],
        signingOrder,
        "draft",
        now(),
      ]
    );
    const { rows } = await pool.query("SELECT * FROM recipients WHERE id=$1", [
      rid,
    ]);
    res.status(201).json(rows[0]);
  })
);

// Place a field on the document, assigned to a recipient.
app.post(
  "/api/documents/:id/fields",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    const field = await insertField(doc.id, req.body.recipientId, req.body);
    if (!field)
      return res.status(400).json({ error: "invalid recipientId or field" });
    res.status(201).json(field);
  })
);

async function insertField(documentId, recipientId, f) {
  if (!recipientId) return null;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO fields (id,document_id,recipient_id,type,page,x_pct,y_pct,w,h,required,created_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      documentId,
      recipientId,
      f.type,
      f.page ?? 0,
      f.xPct ?? f.x_pct ?? 0,
      f.yPct ?? f.y_pct ?? 0,
      f.w ?? 150,
      f.h ?? 40,
      f.required !== false,
      now(),
    ]
  );
  const { rows } = await pool.query("SELECT * FROM fields WHERE id=$1", [id]);
  return rows[0];
}

// Attach (or replace) the real source PDF for a document.
app.post(
  "/api/documents/:id/file",
  requireAuth(),
  upload.single("file"),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    if (!req.file) return res.status(400).json({ error: "file is required" });
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "only application/pdf is supported" });
    }

    let pageCount;
    try {
      const pdfDoc = await PDFDocument.load(req.file.buffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      return res.status(400).json({ error: "could not read the uploaded PDF" });
    }

    const filePath = await saveSourceFile(doc.id, req.file.buffer);
    await pool.query(
      "UPDATE documents SET source_file_path=$1, page_count=$2 WHERE id=$3",
      [filePath, pageCount, doc.id]
    );
    await audit(doc.id, "sender", "source_file_uploaded", `${pageCount} page(s)`, ipOf(req));
    res.json(await fullDocument(doc.id));
  })
);

// Download the original source PDF (sender view).
app.get(
  "/api/documents/:id/file",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    if (!doc.source_file_path)
      return res.status(404).json({ error: "no source file uploaded" });
    const bytes = await readFileBytes(doc.source_file_path);
    res.type("application/pdf").send(bytes);
  })
);

// Download the flattened, sealed PDF (sender view).
app.get(
  "/api/documents/:id/sealed-file",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    if (!doc.sealed_file_path)
      return res.status(404).json({ error: "document is not sealed yet" });
    const bytes = await readFileBytes(doc.sealed_file_path);
    res.type("application/pdf").send(bytes);
  })
);

// Send: mint a token per recipient, flip to 'sent', return their portal links.
app.post(
  "/api/documents/:id/send",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    const recs = await recipientsOf(doc.id);
    if (!recs.length)
      return res.status(400).json({ error: "add at least one recipient" });
    if (!(await fieldsOf(doc.id)).length)
      return res.status(400).json({ error: "add at least one field" });

    await pool.query("UPDATE documents SET status='sent' WHERE id=$1", [doc.id]);
    const links = [];
    for (const r of recs) {
      const token = randomBytes(24).toString("hex");
      await pool.query(
        "UPDATE recipients SET token=$1, status='sent' WHERE id=$2",
        [token, r.id]
      );
      await audit(doc.id, "sender", "sent", `${r.name} <${r.email || ""}>`, ipOf(req));
      const url = `${BASE_URL}/sign/${token}`;
      emit("recipient.sent", { documentId: doc.id, recipient: r.name, url });
      links.push({ recipient: r.name, email: r.email, signingUrl: url });
    }
    res.json({ status: "sent", links });
  })
);

// Full document view for the sender dashboard.
app.get(
  "/api/documents/:id",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    res.json(await fullDocument(doc.id));
  })
);

app.get(
  "/api/documents/:id/audit",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    const { rows } = await pool.query(
      "SELECT actor,event,meta,ip,created_at FROM audit_events WHERE document_id=$1 ORDER BY created_at",
      [doc.id]
    );
    res.json(rows);
  })
);

app.get(
  "/api/documents/:id/certificate",
  requireAuth(),
  ah(async (req, res) => {
    const doc = await getOwnedDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: "document not found" });
    if (doc.status !== "completed")
      return res.status(409).json({ error: "not completed yet" });
    const recs = await recipientsOf(doc.id);
    const { rows: auditRows } = await pool.query(
      "SELECT actor,event,meta,ip,created_at FROM audit_events WHERE document_id=$1 ORDER BY created_at",
      [doc.id]
    );
    res.json({
      document: doc.title,
      envelopeId: doc.id,
      sealedHash: doc.sealed_hash,
      completedAt: doc.completed_at,
      signers: recs.map((r) => ({
        name: r.name,
        email: r.email,
        status: r.status,
      })),
      audit: auditRows,
    });
  })
);

// =====================================================================
// SIGNER SIDE (token-scoped portal — no account needed)
// =====================================================================

// The signer opens their portal. First open flips 'sent' -> 'viewed'.
app.get(
  "/api/sign/:token",
  ah(async (req, res) => {
    const rec = await getByTok(req.params.token);
    if (!rec) return res.status(404).json({ error: "invalid or expired link" });
    const doc = await getDoc(rec.document_id);
    if (rec.status === "sent") {
      await pool.query("UPDATE recipients SET status='viewed' WHERE id=$1", [
        rec.id,
      ]);
      await audit(doc.id, rec.name, "viewed", null, ipOf(req));
      emit("recipient.viewed", { documentId: doc.id, recipient: rec.name });
    }
    const all = await fieldsOf(doc.id);
    const colorsByRecipient = new Map(
      (await recipientsOf(doc.id)).map((r) => [r.id, r.color])
    );
    res.json({
      document: {
        title: doc.title,
        pages: JSON.parse(doc.pages),
        status: doc.status,
        pageCount: doc.page_count,
        sourceFileAvailable: !!doc.source_file_path,
      },
      me: {
        id: rec.id,
        name: rec.name,
        email: rec.email,
        color: rec.color,
        status: rec.status,
      },
      // return all fields but mark which are the signer's; others render as locked context
      fields: all.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        xPct: f.x_pct,
        yPct: f.y_pct,
        w: f.w,
        h: f.h,
        required: !!f.required,
        value: f.value,
        mine: f.recipient_id === rec.id,
        color: colorsByRecipient.get(f.recipient_id) || "#888",
      })),
    });
  })
);

// Stream the source PDF bytes for the signer to view (token-scoped).
app.get(
  "/api/sign/:token/file",
  ah(async (req, res) => {
    const rec = await getByTok(req.params.token);
    if (!rec) return res.status(404).json({ error: "invalid or expired link" });
    const doc = await getDoc(rec.document_id);
    if (!doc.source_file_path)
      return res.status(404).json({ error: "no source file uploaded" });
    const bytes = await readFileBytes(doc.source_file_path);
    res.type("application/pdf").send(bytes);
  })
);

// Save one field value (called as the signer fills each field).
app.post(
  "/api/sign/:token/fields/:fieldId",
  ah(async (req, res) => {
    const rec = await getByTok(req.params.token);
    if (!rec) return res.status(404).json({ error: "invalid link" });
    if (rec.status === "signed")
      return res.status(409).json({ error: "already signed" });
    const { rows } = await pool.query(
      "SELECT * FROM fields WHERE id=$1 AND document_id=$2",
      [req.params.fieldId, rec.document_id]
    );
    const field = rows[0];
    if (!field || field.recipient_id !== rec.id)
      return res.status(403).json({ error: "not your field" });
    await pool.query("UPDATE fields SET value=$1, value_meta=$2 WHERE id=$3", [
      req.body.value ?? null,
      req.body.valueMeta ? JSON.stringify(req.body.valueMeta) : null,
      field.id,
    ]);
    res.json({ ok: true });
  })
);

// Finish signing: requires consent + all required fields filled. Seals if last.
app.post(
  "/api/sign/:token/complete",
  ah(async (req, res) => {
    const rec = await getByTok(req.params.token);
    if (!rec) return res.status(404).json({ error: "invalid link" });
    if (rec.status === "signed") return res.json({ status: "already signed" });
    if (!req.body.consent)
      return res
        .status(400)
        .json({ error: "electronic-signature consent is required" });

    const { rows: mine } = await pool.query(
      "SELECT * FROM fields WHERE recipient_id=$1",
      [rec.id]
    );
    const missing = mine.filter(
      (f) => f.required && (f.value === null || f.value === "")
    );
    if (missing.length)
      return res
        .status(400)
        .json({ error: `${missing.length} required field(s) unfilled` });

    const ip = ipOf(req);
    await pool.query("UPDATE recipients SET status='signed' WHERE id=$1", [
      rec.id,
    ]);
    await pool.query(
      `INSERT INTO consents (id,document_id,recipient_id,text_shown,ip,user_agent,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        rec.document_id,
        rec.id,
        CONSENT_DISCLOSURE_TEXT,
        ip,
        userAgentOf(req),
        now(),
      ]
    );
    await audit(
      rec.document_id,
      rec.name,
      "consent",
      "Accepted electronic signature consent (ESIGN/UETA)",
      ip
    );
    await audit(
      rec.document_id,
      rec.name,
      "signed",
      rec.email ? `<${rec.email}>` : null,
      ip
    );
    emit("recipient.signed", {
      documentId: rec.document_id,
      recipient: rec.name,
    });

    // all signed? seal it.
    const recs = await recipientsOf(rec.document_id);
    if (recs.every((r) => r.status === "signed")) {
      const doc = await getDoc(rec.document_id);
      const { hash, filePath } = await sealDocument({
        document: doc,
        recipients: recs,
        fields: await fieldsOf(doc.id),
      });
      await pool.query(
        "UPDATE documents SET status='completed', sealed_hash=$1, sealed_file_path=$2, completed_at=$3 WHERE id=$4",
        [hash, filePath || null, now(), doc.id]
      );
      await audit(doc.id, "system", "completed", `SHA-256 ${hash}`, null);
      emit("document.completed", { documentId: doc.id, sealedHash: hash });
      return res.json({ status: "completed", sealedHash: hash });
    }
    res.json({ status: "signed" });
  })
);

// ---- assembly helpers ----
async function fullDocument(id) {
  const doc = await getDoc(id);
  const recs = await recipientsOf(id);
  const fields = await fieldsOf(id);
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    pages: JSON.parse(doc.pages),
    pageCount: doc.page_count,
    sourceFileAvailable: !!doc.source_file_path,
    sealedFileAvailable: !!doc.sealed_file_path,
    sealedHash: doc.sealed_hash,
    createdAt: doc.created_at,
    completedAt: doc.completed_at,
    recipients: recs.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      color: r.color,
      status: r.status,
      signingOrder: r.signing_order,
      signingUrl: r.token ? `${BASE_URL}/sign/${r.token}` : null,
    })),
    fields: fields.map((f) => ({
      id: f.id,
      recipientId: f.recipient_id,
      type: f.type,
      page: f.page,
      xPct: f.x_pct,
      yPct: f.y_pct,
      w: f.w,
      h: f.h,
      required: !!f.required,
      value: f.value,
    })),
  };
}

// Must be registered after every route: catches errors passed via next(err)
// (including anything forwarded by the ah() wrapper above).
// eslint-disable-next-line no-unused-vars -- Express requires 4 args to detect error middleware
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  app.listen(PORT, () => console.log(`Esign API on ${BASE_URL}`));
}

