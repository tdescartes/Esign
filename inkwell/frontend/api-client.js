// api-client.js — thin wrappers around the InkWell API.
//
// The current index.html demo keeps all state in the browser. When you're ready
// to connect it to the backend, import these and replace the demo's in-memory
// mutations with these calls. Each function maps to one endpoint in server.js.

const API = location.origin.includes("localhost") ? "http://localhost:3000/api" : "/api";

async function j(url, opts) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// ---- sender ----
export const createDocument = (title, pages, recipients = [], fields = []) =>
  j(`${API}/documents`, { method: "POST", body: JSON.stringify({ title, pages, recipients, fields }) });

export const addRecipient = (docId, name, email) =>
  j(`${API}/documents/${docId}/recipients`, { method: "POST", body: JSON.stringify({ name, email }) });

export const addField = (docId, recipientId, field) =>
  j(`${API}/documents/${docId}/fields`, { method: "POST", body: JSON.stringify({ recipientId, ...field }) });

export const sendDocument = (docId) =>
  j(`${API}/documents/${docId}/send`, { method: "POST" });

export const getDocument   = (docId) => j(`${API}/documents/${docId}`);
export const getAudit      = (docId) => j(`${API}/documents/${docId}/audit`);
export const getCertificate = (docId) => j(`${API}/documents/${docId}/certificate`);

// ---- signer (token-scoped portal) ----
export const openPortal = (token) => j(`${API}/sign/${token}`);

export const fillField = (token, fieldId, value, valueMeta) =>
  j(`${API}/sign/${token}/fields/${fieldId}`, { method: "POST", body: JSON.stringify({ value, valueMeta }) });

export const finishSigning = (token, consent = true) =>
  j(`${API}/sign/${token}/complete`, { method: "POST", body: JSON.stringify({ consent }) });
