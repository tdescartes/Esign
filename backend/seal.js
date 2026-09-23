// seal.js — turn a completed document into a tamper-evident fingerprint.
//
// The four legal pillars of a binding e-signature (ESIGN/UETA) are intent,
// consent, attribution, and *integrity*. This file handles integrity.
//
// When the sender uploaded a real source PDF, we flatten every signer's
// values directly into the PDF bytes with pdf-lib and hash those bytes —
// the strongest form of evidence, since the hash covers the actual
// document a human would open and read.
//
// When no source PDF was uploaded (the HTML-page demo/legacy path), we fall
// back to hashing a canonical JSON snapshot of the document + values, exactly
// as before, so existing documents and tests keep working unchanged.

import { createHash } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import { readFileBytes, saveSealedFile } from "./storage.js";

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

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Convert on-screen px units (the field w/h convention used by the editor)
// to PDF points at an assumed 96dpi preview — an approximation, not a
// pixel-perfect mapping, since the source PDF's actual page size may differ
// slightly from the editor's preview canvas.
const PT_PER_PX = 72 / 96;

async function flattenPdf({ documentId, sourceFilePath, fields }) {
  const sourceBytes = await readFileBytes(sourceFilePath);
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (!field.value) continue;
    const page = pages[field.page];
    if (!page) continue;

    const { width, height } = page.getSize();
    const boxHeightPt = field.h * PT_PER_PX;
    const x = (field.x_pct / 100) * width;
    const y = height - (field.y_pct / 100) * height - boxHeightPt;

    if (typeof field.value === "string" && field.value.startsWith("data:image")) {
      try {
        const base64 = field.value.split(",")[1] || "";
        const imageBytes = Buffer.from(base64, "base64");
        const image = field.value.startsWith("data:image/png")
          ? await pdfDoc.embedPng(imageBytes)
          : await pdfDoc.embedJpg(imageBytes);
        page.drawImage(image, { x, y, width: field.w * PT_PER_PX, height: boxHeightPt });
      } catch {
        page.drawText("[signature]", { x, y: y + 4, size: 10 });
      }
    } else {
      page.drawText(String(field.value).slice(0, 200), {
        x,
        y: y + 4,
        size: 11,
        color: rgb(0.07, 0.09, 0.15),
      });
    }
  }

  const sealedBytes = await pdfDoc.save();
  const hash = sha256Bytes(sealedBytes);
  const filePath = await saveSealedFile(documentId, sealedBytes);
  return { hash, filePath };
}

function sealCanonicalSnapshot({ document, recipients, fields }) {
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

export async function sealDocument({ document, recipients, fields }) {
  if (document.source_file_path) {
    return flattenPdf({ documentId: document.id, sourceFilePath: document.source_file_path, fields });
  }
  return sealCanonicalSnapshot({ document, recipients, fields });
}

