import swaggerJsdoc from "swagger-jsdoc";

const errorResponse = {
  description: "Request failed",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export const openApiSpecification = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Esign API",
      version: "0.1.0",
      description:
        "API for creating document envelopes, assigning signing fields, completing token-scoped signer portals, and retrieving audit evidence.",
    },
    servers: [{ url: "/", description: "Current server" }],
    tags: [
      { name: "System", description: "Service health and metadata" },
      { name: "Auth", description: "Sender signup, login, and session management" },
      { name: "Documents", description: "Sender-side document workflow" },
      { name: "Signing", description: "Token-scoped signer workflow" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "esign_session",
        },
      },
      parameters: {
        DocumentId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
        SigningToken: {
          name: "token",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
        RecipientInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email", nullable: true },
            color: { type: "string", example: "#0f9d6b" },
            signingOrder: { type: "integer", minimum: 0, default: 0 },
          },
        },
        Recipient: {
          allOf: [
            { $ref: "#/components/schemas/RecipientInput" },
            {
              type: "object",
              required: ["id", "status", "signingUrl"],
              properties: {
                id: { type: "string", format: "uuid" },
                status: {
                  type: "string",
                  enum: ["draft", "sent", "viewed", "signed"],
                },
                signingUrl: { type: "string", nullable: true },
              },
            },
          ],
        },
        FieldInput: {
          type: "object",
          required: ["type"],
          properties: {
            recipientId: { type: "string", format: "uuid" },
            recipientIndex: { type: "integer", minimum: 0 },
            type: {
              type: "string",
              enum: ["signature", "initials", "name", "date", "text", "check"],
            },
            page: { type: "integer", minimum: 0, default: 0 },
            xPct: { type: "number", minimum: 0, maximum: 100 },
            yPct: { type: "number", minimum: 0, maximum: 100 },
            w: { type: "number", default: 150 },
            h: { type: "number", default: 40 },
            required: { type: "boolean", default: true },
          },
        },
        Field: {
          allOf: [
            { $ref: "#/components/schemas/FieldInput" },
            {
              type: "object",
              required: ["id", "recipientId"],
              properties: {
                id: { type: "string", format: "uuid" },
                recipientId: { type: "string", format: "uuid" },
                value: { type: "string", nullable: true },
              },
            },
          ],
        },
        Document: {
          type: "object",
          required: ["id", "title", "status", "pages", "recipients", "fields"],
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            status: { type: "string", enum: ["draft", "sent", "completed"] },
            pages: { type: "array", items: { type: "string" } },
            sealedHash: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            completedAt: { type: "string", format: "date-time", nullable: true },
            recipients: {
              type: "array",
              items: { $ref: "#/components/schemas/Recipient" },
            },
            fields: {
              type: "array",
              items: { $ref: "#/components/schemas/Field" },
            },
          },
        },
        AuditEvent: {
          type: "object",
          properties: {
            actor: { type: "string", nullable: true },
            event: { type: "string" },
            meta: { type: "string", nullable: true },
            ip: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["System"],
          summary: "Check API health",
          responses: {
            200: {
              description: "API is available",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean", example: true },
                      service: { type: "string", example: "esign-api" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Create a sender account and start a session",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    name: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Account created; session cookie set" },
            400: errorResponse,
            409: errorResponse,
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Log in and start a session",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Session cookie set" },
            400: errorResponse,
            401: errorResponse,
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Revoke the current session",
          responses: { 200: { description: "Session revoked" } },
        },
      },
      "/api/me": {
        get: {
          tags: ["Auth"],
          summary: "Get the authenticated sender",
          security: [{ cookieAuth: [] }],
          responses: {
            200: { description: "The authenticated sender" },
            401: errorResponse,
          },
        },
      },
      "/api/documents": {
        post: {
          tags: ["Documents"],
          summary: "Create a draft document",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", default: "Untitled" },
                    pages: { type: "array", items: { type: "string" } },
                    recipients: {
                      type: "array",
                      items: { $ref: "#/components/schemas/RecipientInput" },
                    },
                    fields: {
                      type: "array",
                      items: { $ref: "#/components/schemas/FieldInput" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Draft created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Document" },
                },
              },
            },
          },
        },
      },
      "/api/documents/{id}": {
        get: {
          tags: ["Documents"],
          summary: "Get a document envelope",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: {
              description: "Document envelope",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Document" },
                },
              },
            },
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/recipients": {
        post: {
          tags: ["Documents"],
          summary: "Add a signer to a draft",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecipientInput" },
              },
            },
          },
          responses: {
            201: {
              description: "Recipient created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Recipient" },
                },
              },
            },
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/fields": {
        post: {
          tags: ["Documents"],
          summary: "Place a field for a signer",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FieldInput" },
              },
            },
          },
          responses: {
            201: {
              description: "Field created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Field" },
                },
              },
            },
            400: errorResponse,
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/file": {
        post: {
          tags: ["Documents"],
          summary: "Upload the real source PDF for a document",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Source PDF stored",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Document" },
                },
              },
            },
            400: errorResponse,
            404: errorResponse,
          },
        },
        get: {
          tags: ["Documents"],
          summary: "Download the uploaded source PDF",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: { description: "PDF bytes", content: { "application/pdf": {} } },
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/sealed-file": {
        get: {
          tags: ["Documents"],
          summary: "Download the flattened, sealed PDF",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: { description: "Sealed PDF bytes", content: { "application/pdf": {} } },
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/send": {
        post: {
          tags: ["Documents"],
          summary: "Send a document and create signer links",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: {
              description: "Document sent",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "sent" },
                      links: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            recipient: { type: "string" },
                            email: { type: "string", nullable: true },
                            signingUrl: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: errorResponse,
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/audit": {
        get: {
          tags: ["Documents"],
          summary: "Get the document audit trail",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: {
              description: "Audit events",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/AuditEvent" },
                  },
                },
              },
            },
            404: errorResponse,
          },
        },
      },
      "/api/documents/{id}/certificate": {
        get: {
          tags: ["Documents"],
          summary: "Get the completion certificate",
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/DocumentId" }],
          responses: {
            200: { description: "Completion certificate" },
            404: errorResponse,
            409: errorResponse,
          },
        },
      },
      "/api/sign/{token}": {
        get: {
          tags: ["Signing"],
          summary: "Open a signer portal",
          parameters: [{ $ref: "#/components/parameters/SigningToken" }],
          responses: {
            200: { description: "Signer portal payload" },
            404: errorResponse,
          },
        },
      },
      "/api/sign/{token}/file": {
        get: {
          tags: ["Signing"],
          summary: "Stream the document's source PDF for the signer to view",
          parameters: [{ $ref: "#/components/parameters/SigningToken" }],
          responses: {
            200: { description: "PDF bytes", content: { "application/pdf": {} } },
            404: errorResponse,
          },
        },
      },
      "/api/sign/{token}/fields/{fieldId}": {
        post: {
          tags: ["Signing"],
          summary: "Save a signer field value",
          parameters: [
            { $ref: "#/components/parameters/SigningToken" },
            {
              name: "fieldId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    value: { type: "string", nullable: true },
                    valueMeta: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Field saved" },
            403: errorResponse,
            404: errorResponse,
            409: errorResponse,
          },
        },
      },
      "/api/sign/{token}/complete": {
        post: {
          tags: ["Signing"],
          summary: "Complete signing with electronic-signature consent",
          parameters: [{ $ref: "#/components/parameters/SigningToken" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["consent"],
                  properties: { consent: { type: "boolean" } },
                },
              },
            },
          },
          responses: {
            200: { description: "Signer or document completion status" },
            400: errorResponse,
            404: errorResponse,
          },
        },
      },
    },
  },
  apis: [],
});