// storage.js — local-disk storage for uploaded and sealed PDF bytes.
// Swap for S3-compatible object storage later; callers only need
// documentId + bytes in, a file path out (or bytes back on read).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(serverDir, "uploads");
const SEALED_DIR = process.env.SEALED_DIR || path.resolve(serverDir, "sealed");

// Document ids are always server-generated UUIDs; enforce the shape strictly
// before using a value as a filename so this can never be a path-traversal vector.
const SAFE_ID = /^[a-f0-9-]{36}$/i;

function assertSafeId(id) {
  if (!SAFE_ID.test(id)) throw new Error("invalid document id");
}

export async function saveSourceFile(documentId, bytes) {
  assertSafeId(documentId);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, `${documentId}.pdf`);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function saveSealedFile(documentId, bytes) {
  assertSafeId(documentId);
  await mkdir(SEALED_DIR, { recursive: true });
  const filePath = path.join(SEALED_DIR, `${documentId}.pdf`);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function readFileBytes(filePath) {
  return readFile(filePath);
}
