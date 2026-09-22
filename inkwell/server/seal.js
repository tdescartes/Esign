// seal.js — turn a completed document into a tamper-evident fingerprint.
//
// The four legal pillars of a binding e-signature (ESIGN/UETA) are intent,
// consent, attribution, and *integrity*. This file handles integrity: we
// build a canonical (stable, deterministic) representation of the finished
// document + every signer's values, then hash it with SHA-256. If a single
// character changes afterward, the hash changes completely — that is the
// evidence that the sealed record was not altered.

import { createHash } from "node:crypto";

// Stable stringify: keys always emitted in sorted order so the same logical
// document always produces the same bytes (and therefore the same hash).
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}

export function sha256(str) {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

// Build the canonical payload from a document and its rows, then hash it.
export function sealDocument({ document, recipients, fields }) {
  const payload = {
    title: document.title,
    pages: JSON.parse(document.pages),
    signers: recipients
      .map(r => ({ name: r.name, email: r.email, status: r.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    fields: fields
      .map(f => ({ type: f.type, recipient_id: f.recipient_id, page: f.page, value: f.value }))
      .sort((a, b) => (a.recipient_id + a.page + a.type).localeCompare(b.recipient_id + b.page + b.type)),
  };
  const canonicalString = canonical(payload);
  return { hash: sha256(canonicalString), canonicalString };
}
