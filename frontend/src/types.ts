import type { Field, Recipient } from "@esign/shared";

export type WorkspaceView = "sender" | "cert" | Recipient["id"];

export interface WorkspaceField extends Field {
    valueHTML?: string;
}

export interface WorkspaceRecipient extends Recipient {
    portalToken?: string;
}

export interface WorkspaceState {
    documentId: string | null;
    view: WorkspaceView;
    sent: boolean;
    completed: boolean;
    placeType: Field["type"] | null;
    placeRecipient: Recipient["id"] | null;
    recipients: WorkspaceRecipient[];
    fields: WorkspaceField[];
}
