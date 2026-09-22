import type {
    CertificateResponse,
    DocumentEnvelope,
    SendDocumentResponse,
    SignPortalResponse,
    FieldType
} from "@inkwell/shared";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json"
        },
        ...init
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || response.statusText);
    }

    return response.json() as Promise<T>;
}

export function getHealth() {
    return request<{ ok: true; service: string }>("/health");
}

export function getDocument(documentId: string) {
    return request<DocumentEnvelope>(`/documents/${documentId}`);
}

export function getCertificate(documentId: string) {
    return request<CertificateResponse>(`/documents/${documentId}/certificate`);
}

export function createDocument(payload: {
    title: string;
    pages: string[];
    recipients: Array<{ name: string; email: string | null; color?: string; signingOrder?: number }>;
    fields: Array<{
        recipientIndex: number;
        type: FieldType;
        page: number;
        xPct: number;
        yPct: number;
        w: number;
        h: number;
        required?: boolean;
    }>;
}) {
    return request<DocumentEnvelope>("/documents", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function sendDocument(documentId: string) {
    return request<SendDocumentResponse>(`/documents/${documentId}/send`, {
        method: "POST"
    });
}

export function openPortal(token: string) {
    return request<SignPortalResponse>(`/sign/${token}`);
}

export function fillField(token: string, fieldId: string, value: string) {
    return request<{ ok: true }>(`/sign/${token}/fields/${fieldId}`, {
        method: "POST",
        body: JSON.stringify({ value })
    });
}

export function completeSigning(token: string, consent = true) {
    return request<{ status: string; sealedHash?: string }>(`/sign/${token}/complete`, {
        method: "POST",
        body: JSON.stringify({ consent })
    });
}
