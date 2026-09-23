export type FieldType = "signature" | "initials" | "name" | "date" | "text" | "check";

export type DocumentStatus = "draft" | "sent" | "completed";

export type RecipientStatus = "draft" | "sent" | "viewed" | "signed";

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
}

export interface Recipient {
    id: string;
    name: string;
    email: string | null;
    color: string;
    status: RecipientStatus;
    signingOrder: number;
    signingUrl: string | null;
}

export interface Field {
    id: string;
    recipientId: string;
    type: FieldType;
    page: number;
    xPct: number;
    yPct: number;
    w: number;
    h: number;
    required: boolean;
    value: string | null;
}

export interface DocumentEnvelope {
    id: string;
    title: string;
    status: DocumentStatus;
    pages: string[];
    pageCount: number;
    sourceFileAvailable: boolean;
    sealedFileAvailable: boolean;
    sealedHash: string | null;
    createdAt: string;
    completedAt: string | null;
    recipients: Recipient[];
    fields: Field[];
}


export interface AuditEvent {
    actor: string | null;
    event: string;
    meta: string | null;
    ip: string | null;
    created_at: string;
}

export interface CertificateResponse {
    document: string;
    envelopeId: string;
    sealedHash: string;
    completedAt: string;
    signers: Array<Pick<Recipient, "name" | "email" | "status">>;
    audit: AuditEvent[];
}

export interface SignPortalField {
    id: string;
    type: FieldType;
    page: number;
    xPct: number;
    yPct: number;
    w: number;
    h: number;
    required: boolean;
    value: string | null;
    mine: boolean;
    color: string;
}

export interface SignPortalResponse {
    document: {
        title: string;
        pages: string[];
        status: DocumentStatus;
        pageCount: number;
        sourceFileAvailable: boolean;
    };
    me: Pick<Recipient, "id" | "name" | "email" | "color" | "status">;
    fields: SignPortalField[];
}

export interface SendDocumentResponse {
    status: "sent";
    links: Array<{
        recipient: string;
        email: string | null;
        signingUrl: string;
    }>;
}
