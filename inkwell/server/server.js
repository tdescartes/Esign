// server.js — InkWell API.
//
// Mirrors the demo's model exactly:
//   sender  -> creates a document, adds recipients (signers), places fields, sends
//   signer  -> opens their private token portal, fills only their fields, consents, finishes
//   system  -> when every signer has signed, seals the document (SHA-256) + writes audit
//
// Everything a court would want lives in audit_events. Run: npm install && npm start

import express from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { sealDocument } from "./seal.js";

export const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
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

app.use(express.json({ limit: "8mb" })); // roomy for drawn-signature data-URIs
app.use(express.static("../frontend")); // serve the demo UI at /

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "inkwell-api" });
});

// permissive CORS for local dev — lock this down in production
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
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

function audit(documentId, actor, event, meta, ip) {
  db.prepare(
    `INSERT INTO audit_events (id,document_id,actor,event,meta,ip,created_at)
              VALUES (?,?,?,?,?,?,?)`
  ).run(
    randomUUID(),
    documentId,
    actor,
    event,
    meta || null,
    ip || null,
    now()
  );
}

// Stub webhook emitter. In production, look up subscriber URLs for this document's
// owner and POST the event. Kept as a log so the integration point is obvious.
function emit(event, payload) {
  console.log(`[webhook] ${event}`, JSON.stringify(payload));
  // TODO: for each subscribed url -> fetch(url, { method:'POST', body: JSON.stringify({event,payload}) })
}

const getDoc = (id) => db.prepare("SELECT * FROM documents WHERE id=?").get(id);
const getByTok = (t) =>
  db.prepare("SELECT * FROM recipients WHERE token=?").get(t);
const recipientsOf = (id) =>
  db
    .prepare(
      "SELECT * FROM recipients WHERE document_id=? ORDER BY signing_order, created_at"
    )
    .all(id);
const fieldsOf = (id) =>
  db.prepare("SELECT * FROM fields WHERE document_id=?").all(id);

// =====================================================================
// SENDER SIDE
// =====================================================================

// Create a document (draft). Optionally include recipients + fields inline.
app.post("/api/documents", (req, res) => {
  const {
    title = "Untitled",
    pages = [],
    recipients = [],
    fields = [],
  } = req.body;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO documents (id,title,pages,status,created_at) VALUES (?,?,?,?,?)`
  ).run(id, title, JSON.stringify(pages), "draft", now());
  audit(id, "sender", "created", title);

  const recIdByIndex = {};
  recipients.forEach((r, i) => {
    const rid = randomUUID();
    recIdByIndex[i] = rid;
    db.prepare(
      `INSERT INTO recipients (id,document_id,name,email,color,signing_order,status,created_at)
                VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      rid,
      id,
      r.name || `Signer ${i + 1}`,
      r.email || null,
      r.color || COLORS[i % COLORS.length],
      r.signingOrder || 0,
      "draft",
      now()
    );
  });
  fields.forEach((f) =>
    insertField(id, f.recipientId ?? recIdByIndex[f.recipientIndex], f)
  );

  res.status(201).json(fullDocument(id));
});

// Add one recipient (signer) to a draft document.
app.post("/api/documents/:id/recipients", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  const count = recipientsOf(doc.id).length;
  const { name, email, signingOrder = 0 } = req.body;
  const rid = randomUUID();
  db.prepare(
    `INSERT INTO recipients (id,document_id,name,email,color,signing_order,status,created_at)
              VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    rid,
    doc.id,
    name || `Signer ${count + 1}`,
    email || null,
    COLORS[count % COLORS.length],
    signingOrder,
    "draft",
    now()
  );
  res
    .status(201)
    .json(db.prepare("SELECT * FROM recipients WHERE id=?").get(rid));
});

// Place a field on the document, assigned to a recipient.
app.post("/api/documents/:id/fields", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  const field = insertField(doc.id, req.body.recipientId, req.body);
  if (!field)
    return res.status(400).json({ error: "invalid recipientId or field" });
  res.status(201).json(field);
});

function insertField(documentId, recipientId, f) {
  if (!recipientId) return null;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO fields (id,document_id,recipient_id,type,page,x_pct,y_pct,w,h,required,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    documentId,
    recipientId,
    f.type,
    f.page ?? 0,
    f.xPct ?? f.x_pct ?? 0,
    f.yPct ?? f.y_pct ?? 0,
    f.w ?? 150,
    f.h ?? 40,
    f.required === false ? 0 : 1,
    now()
  );
  return db.prepare("SELECT * FROM fields WHERE id=?").get(id);
}

// Send: mint a token per recipient, flip to 'sent', return their portal links.
app.post("/api/documents/:id/send", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  const recs = recipientsOf(doc.id);
  if (!recs.length)
    return res.status(400).json({ error: "add at least one recipient" });
  if (!fieldsOf(doc.id).length)
    return res.status(400).json({ error: "add at least one field" });

  db.prepare("UPDATE documents SET status='sent' WHERE id=?").run(doc.id);
  const links = recs.map((r) => {
    const token = randomBytes(24).toString("hex");
    db.prepare("UPDATE recipients SET token=?, status='sent' WHERE id=?").run(
      token,
      r.id
    );
    audit(doc.id, "sender", "sent", `${r.name} <${r.email || ""}>`, ipOf(req));
    const url = `${BASE_URL}/sign/${token}`;
    emit("recipient.sent", { documentId: doc.id, recipient: r.name, url });
    return { recipient: r.name, email: r.email, signingUrl: url };
  });
  res.json({ status: "sent", links });
});

// Full document view for the sender dashboard.
app.get("/api/documents/:id", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  res.json(fullDocument(doc.id));
});

app.get("/api/documents/:id/audit", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  res.json(
    db
      .prepare(
        "SELECT actor,event,meta,ip,created_at FROM audit_events WHERE document_id=? ORDER BY created_at"
      )
      .all(doc.id)
  );
});

app.get("/api/documents/:id/certificate", (req, res) => {
  const doc = getDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: "document not found" });
  if (doc.status !== "completed")
    return res.status(409).json({ error: "not completed yet" });
  res.json({
    document: doc.title,
    envelopeId: doc.id,
    sealedHash: doc.sealed_hash,
    completedAt: doc.completed_at,
    signers: recipientsOf(doc.id).map((r) => ({
      name: r.name,
      email: r.email,
      status: r.status,
    })),
    audit: db
      .prepare(
        "SELECT actor,event,meta,ip,created_at FROM audit_events WHERE document_id=? ORDER BY created_at"
      )
      .all(doc.id),
  });
});

// =====================================================================
// SIGNER SIDE (token-scoped portal — no account needed)
// =====================================================================

// The signer opens their portal. First open flips 'sent' -> 'viewed'.
app.get("/api/sign/:token", (req, res) => {
  const rec = getByTok(req.params.token);
  if (!rec) return res.status(404).json({ error: "invalid or expired link" });
  const doc = getDoc(rec.document_id);
  if (rec.status === "sent") {
    db.prepare("UPDATE recipients SET status='viewed' WHERE id=?").run(rec.id);
    audit(doc.id, rec.name, "viewed", null, ipOf(req));
    emit("recipient.viewed", { documentId: doc.id, recipient: rec.name });
  }
  const all = fieldsOf(doc.id);
  res.json({
    document: {
      title: doc.title,
      pages: JSON.parse(doc.pages),
      status: doc.status,
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
      color: recipientColor(doc.id, f.recipient_id),
    })),
  });
});

// Save one field value (called as the signer fills each field).
app.post("/api/sign/:token/fields/:fieldId", (req, res) => {
  const rec = getByTok(req.params.token);
  if (!rec) return res.status(404).json({ error: "invalid link" });
  if (rec.status === "signed")
    return res.status(409).json({ error: "already signed" });
  const field = db
    .prepare("SELECT * FROM fields WHERE id=? AND document_id=?")
    .get(req.params.fieldId, rec.document_id);
  if (!field || field.recipient_id !== rec.id)
    return res.status(403).json({ error: "not your field" });
  db.prepare("UPDATE fields SET value=?, value_meta=? WHERE id=?").run(
    req.body.value ?? null,
    req.body.valueMeta ? JSON.stringify(req.body.valueMeta) : null,
    field.id
  );
  res.json({ ok: true });
});

// Finish signing: requires consent + all required fields filled. Seals if last.
app.post("/api/sign/:token/complete", (req, res) => {
  const rec = getByTok(req.params.token);
  if (!rec) return res.status(404).json({ error: "invalid link" });
  if (rec.status === "signed") return res.json({ status: "already signed" });
  if (!req.body.consent)
    return res
      .status(400)
      .json({ error: "electronic-signature consent is required" });

  const mine = db
    .prepare("SELECT * FROM fields WHERE recipient_id=?")
    .all(rec.id);
  const missing = mine.filter(
    (f) => f.required && (f.value === null || f.value === "")
  );
  if (missing.length)
    return res
      .status(400)
      .json({ error: `${missing.length} required field(s) unfilled` });

  const ip = ipOf(req);
  db.prepare("UPDATE recipients SET status='signed' WHERE id=?").run(rec.id);
  audit(
    rec.document_id,
    rec.name,
    "consent",
    "Accepted electronic signature consent (ESIGN/UETA)",
    ip
  );
  audit(
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
  const recs = recipientsOf(rec.document_id);
  if (recs.every((r) => r.status === "signed")) {
    const doc = getDoc(rec.document_id);
    const { hash } = sealDocument({
      document: doc,
      recipients: recs,
      fields: fieldsOf(doc.id),
    });
    db.prepare(
      "UPDATE documents SET status='completed', sealed_hash=?, completed_at=? WHERE id=?"
    ).run(hash, now(), doc.id);
    audit(doc.id, "system", "completed", `SHA-256 ${hash}`, null);
    emit("document.completed", { documentId: doc.id, sealedHash: hash });
    return res.json({ status: "completed", sealedHash: hash });
  }
  res.json({ status: "signed" });
});

// ---- assembly helpers ----
function recipientColor(docId, recipientId) {
  const r = db
    .prepare("SELECT color FROM recipients WHERE id=?")
    .get(recipientId);
  return r ? r.color : "#888";
}
function fullDocument(id) {
  const doc = getDoc(id);
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    pages: JSON.parse(doc.pages),
    sealedHash: doc.sealed_hash,
    createdAt: doc.created_at,
    completedAt: doc.completed_at,
    recipients: recipientsOf(id).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      color: r.color,
      status: r.status,
      signingOrder: r.signing_order,
      signingUrl: r.token ? `${BASE_URL}/sign/${r.token}` : null,
    })),
    fields: fieldsOf(id).map((f) => ({
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

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  app.listen(PORT, () => console.log(`InkWell API on ${BASE_URL}`));
}
