import test from "node:test";
import assert from "node:assert/strict";
import { app } from "./server.js";

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

test("health endpoint responds", async () => {
  const testServer = startServer();

  try {
    const response = await fetch(`${testServer.baseUrl}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, { ok: true, service: "inkwell-api" });
  } finally {
    await testServer.close();
  }
});

test("document signing flow completes and returns certificate", async () => {
  const testServer = startServer();

  try {
    const createResponse = await fetch(`${testServer.baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      `${testServer.baseUrl}/api/documents/${createdDocument.id}/certificate`
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
