import type {
    AuthUser,
    CertificateResponse,
    DocumentEnvelope,
    SendDocumentResponse,
    SignPortalResponse,
    FieldType
} from "@esign/shared";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
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

export function signUp(email: string, password: string, name?: string) {
    return request<AuthUser>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, name })
    });
}

export function logIn(email: string, password: string) {
    return request<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
}

export function logOut() {
    return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

export function getMe() {
    return request<AuthUser>("/me");
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

// Uploads the real source PDF for a document. Bypasses request()'s JSON
// header so the browser can set the multipart/form-data boundary itself.
export async function uploadDocumentFile(documentId: string, file: File) {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch(`${API_BASE}/documents/${documentId}/file`, {
        method: "POST",
        credentials: "include",
        body: formData
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || response.statusText);
    }

    return response.json() as Promise<DocumentEnvelope>;
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

