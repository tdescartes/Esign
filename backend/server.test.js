import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { app } from "./server.js";
import { pool } from "./db.js";

function startServer() {
  const server = app.listen(0);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function extractCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

async function signUp(baseUrl, email, password = "correct horse battery staple") {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Test Sender" }),
  });
  const cookie = extractCookie(response);
  const body = await response.json();
  return { response, cookie, body };
}

test("health endpoint responds", async () => {
  const testServer = startServer();

  try {
    const response = await fetch(`${testServer.baseUrl}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, { ok: true, service: "esign-api" });
  } finally {
    await testServer.close();
  }
});

test("Swagger UI and OpenAPI specification are available", async () => {
  const testServer = startServer();

  try {
    const specificationResponse = await fetch(
      `${testServer.baseUrl}/api/docs.json`
    );
    assert.equal(specificationResponse.status, 200);

    const specification = await specificationResponse.json();
    assert.equal(specification.openapi, "3.0.3");
    assert.equal(specification.info.title, "Esign API");
    assert.ok(specification.paths["/api/documents"]);
    assert.ok(specification.paths["/api/sign/{token}/complete"]);

    const uiResponse = await fetch(`${testServer.baseUrl}/api/docs/`);
    assert.equal(uiResponse.status, 200);
    assert.match(await uiResponse.text(), /Swagger UI/);
  } finally {
    await testServer.close();
  }
});

test("signup, login, and /api/me reflect the authenticated sender", async () => {
  const testServer = startServer();

  try {
    const email = uniqueEmail("owner");
    const { response: signupResponse, cookie, body: signupBody } = await signUp(
      testServer.baseUrl,
      email
    );
    assert.equal(signupResponse.status, 201);
    assert.equal(signupBody.email, email);
    assert.ok(cookie);

    const duplicateResponse = await fetch(`${testServer.baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "another password" }),
    });
    assert.equal(duplicateResponse.status, 409);

    const meResponse = await fetch(`${testServer.baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(meResponse.status, 200);
    assert.equal((await meResponse.json()).email, email);

    const unauthenticatedResponse = await fetch(`${testServer.baseUrl}/api/me`);
    assert.equal(unauthenticatedResponse.status, 401);

    const badLoginResponse = await fetch(`${testServer.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong password" }),
    });
    assert.equal(badLoginResponse.status, 401);

    const loginResponse = await fetch(`${testServer.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct horse battery staple" }),
    });
    assert.equal(loginResponse.status, 200);
    const loginCookie = extractCookie(loginResponse);

    const logoutResponse = await fetch(`${testServer.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: loginCookie },
    });
    assert.equal(logoutResponse.status, 200);

    const afterLogoutResponse = await fetch(`${testServer.baseUrl}/api/me`, {
      headers: { Cookie: loginCookie },
    });
    assert.equal(afterLogoutResponse.status, 401);
  } finally {
    await testServer.close();
  }
});

test("a sender cannot read another sender's document", async () => {
  const testServer = startServer();

  try {
    const { cookie: ownerCookie } = await signUp(testServer.baseUrl, uniqueEmail("owner-a"));
    const createResponse = await fetch(`${testServer.baseUrl}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ title: "Private agreement", pages: ["<p>secret</p>"] }),
    });
    const created = await createResponse.json();

    const { cookie: otherCookie } = await signUp(testServer.baseUrl, uniqueEmail("owner-b"));
    const blockedResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${created.id}`,
      { headers: { Cookie: otherCookie } }
    );
    assert.equal(blockedResponse.status, 404);

    const allowedResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${created.id}`,
      { headers: { Cookie: ownerCookie } }
    );
    assert.equal(allowedResponse.status, 200);
  } finally {
    await testServer.close();
  }
});

test("document signing flow completes and returns certificate", async () => {
  const testServer = startServer();

  try {
    const { cookie } = await signUp(testServer.baseUrl, uniqueEmail("sender"));

    const createResponse = await fetch(`${testServer.baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        title: `Agreement ${Date.now()}`,
        pages: ["<h1>Agreement</h1>", "<p>Signature page</p>"],
        recipients: [{ name: "Maya Chen", email: "maya@example.com" }],
        fields: [
          {
            recipientIndex: 0,
            type: "signature",
            page: 1,
            xPct: 12,
            yPct: 62,
            w: 190,
            h: 52,
          },
        ],
      }),
    });

    assert.equal(createResponse.status, 201);
    const createdDocument = await createResponse.json();
    assert.equal(createdDocument.status, "draft");
    assert.equal(createdDocument.recipients.length, 1);
    assert.equal(createdDocument.fields.length, 1);

    const sendResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${createdDocument.id}/send`,
      {
        method: "POST",
        headers: { Cookie: cookie },
      }
    );
    assert.equal(sendResponse.status, 200);

    const sendBody = await sendResponse.json();
    assert.equal(sendBody.status, "sent");
    assert.equal(sendBody.links.length, 1);

    const signingUrl = sendBody.links[0].signingUrl;
    const token = signingUrl.split("/").pop();
    assert.ok(token);

    const portalResponse = await fetch(
      `${testServer.baseUrl}/api/sign/${token}`
    );
    assert.equal(portalResponse.status, 200);

    const portalBody = await portalResponse.json();
    assert.equal(portalBody.me.name, "Maya Chen");
    assert.equal(portalBody.fields.length, 1);
    assert.equal(portalBody.fields[0].mine, true);

    const fieldId = portalBody.fields[0].id;
    const fillResponse = await fetch(
      `${testServer.baseUrl}/api/sign/${token}/fields/${fieldId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: "Maya Chen" }),
      }
    );
    assert.equal(fillResponse.status, 200);

    const completeResponse = await fetch(
      `${testServer.baseUrl}/api/sign/${token}/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ consent: true }),
      }
    );
    assert.equal(completeResponse.status, 200);

    const completeBody = await completeResponse.json();
    assert.equal(completeBody.status, "completed");
    assert.ok(completeBody.sealedHash);

    const certificateResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${createdDocument.id}/certificate`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(certificateResponse.status, 200);

    const certificateBody = await certificateResponse.json();
    assert.equal(certificateBody.document.includes("Agreement"), true);
    assert.equal(certificateBody.envelopeId, createdDocument.id);
    assert.equal(certificateBody.signers[0].status, "signed");
    assert.ok(certificateBody.sealedHash);
    assert.equal(
      certificateBody.audit.some((event) => event.event === "completed"),
      true
    );
  } finally {
    await testServer.close();
  }
});

test("uploading a source PDF produces a real flattened, hashed seal and records consent", async () => {
  const testServer = startServer();

  try {
    const { cookie } = await signUp(testServer.baseUrl, uniqueEmail("pdf-sender"));

    const createResponse = await fetch(`${testServer.baseUrl}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        title: "Real PDF Agreement",
        pages: [],
        recipients: [{ name: "Jordan Rivera", email: "jordan@example.com" }],
        fields: [
          { recipientIndex: 0, type: "text", page: 0, xPct: 10, yPct: 10, w: 150, h: 24 },
        ],
      }),
    });
    const created = await createResponse.json();

    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([612, 792]);
    const sourceBytes = await sourcePdf.save();

    const form = new FormData();
    form.set("file", new Blob([sourceBytes], { type: "application/pdf" }), "source.pdf");

    const uploadResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${created.id}/file`,
      { method: "POST", headers: { Cookie: cookie }, body: form }
    );
    assert.equal(uploadResponse.status, 200);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.pageCount, 1);
    assert.equal(uploaded.sourceFileAvailable, true);

    const sendResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${created.id}/send`,
      { method: "POST", headers: { Cookie: cookie } }
    );
    const sendBody = await sendResponse.json();
    const token = sendBody.links[0].signingUrl.split("/").pop();

    const portalResponse = await fetch(`${testServer.baseUrl}/api/sign/${token}`);
    const portalBody = await portalResponse.json();
    assert.equal(portalBody.document.sourceFileAvailable, true);
    const fieldId = portalBody.fields[0].id;

    await fetch(`${testServer.baseUrl}/api/sign/${token}/fields/${fieldId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "Jordan Rivera" }),
    });

    const completeResponse = await fetch(
      `${testServer.baseUrl}/api/sign/${token}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      }
    );
    const completeBody = await completeResponse.json();
    assert.equal(completeBody.status, "completed");
    assert.ok(completeBody.sealedHash);

    const sealedResponse = await fetch(
      `${testServer.baseUrl}/api/documents/${created.id}/sealed-file`,
      { headers: { Cookie: cookie } }
    );
    assert.equal(sealedResponse.status, 200);
    assert.equal(sealedResponse.headers.get("content-type"), "application/pdf");

    const sealedBytes = Buffer.from(await sealedResponse.arrayBuffer());
    const rehashed = createHash("sha256").update(sealedBytes).digest("hex");
    assert.equal(rehashed, completeBody.sealedHash);

    const flattenedDoc = await PDFDocument.load(sealedBytes);
    assert.equal(flattenedDoc.getPageCount(), 1);

    const { rows: consentRows } = await pool.query(
      "SELECT * FROM consents WHERE document_id=$1",
      [created.id]
    );
    assert.equal(consentRows.length, 1);
    assert.match(consentRows[0].text_shown, /electronically/);
  } finally {
    await testServer.close();
  }
});

