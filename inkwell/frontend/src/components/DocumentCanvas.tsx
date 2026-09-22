import type { Field, Recipient } from "@inkwell/shared";
import { DEFAULTS, PAGE_HTML } from "../constants";
import type { WorkspaceField, WorkspaceView } from "../types";

interface DocumentCanvasProps {
    canEdit: boolean;
    fields: WorkspaceField[];
    onAddField: (page: number, xPct: number, yPct: number) => void;
    onFieldActivate: (fieldId: string) => void;
    onRemoveField: (fieldId: string) => void;
    placeType: Field["type"] | null;
    recipients: Recipient[];
    view: WorkspaceView;
}

export function DocumentCanvas({
    canEdit,
    fields,
    onAddField,
    onFieldActivate,
    onRemoveField,
    placeType,
    recipients,
    view
}: DocumentCanvasProps) {
    const signingId = view !== "sender" && view !== "cert" ? view : null;

    return (
        <section className="panel stage">
            <div className="doc-scroll">
                {PAGE_HTML.map((html, index) => (
                    <article
                        className={`page ${placeType && canEdit ? "placing" : ""}`}
                        key={index}
                        onClick={(event) => {
                            if (!canEdit || !placeType) {
                                return;
                            }

                            const bounds = event.currentTarget.getBoundingClientRect();
                            const xPct = ((event.clientX - bounds.left) / bounds.width) * 100;
                            const yPct = ((event.clientY - bounds.top) / bounds.height) * 100;
                            onAddField(index, xPct, yPct);
                        }}
                    >
                        <div dangerouslySetInnerHTML={{ __html: html }} />
                        {fields
                            .filter((field) => field.page === index)
                            .map((field) => {
                                const recipient = recipients.find((candidate) => candidate.id === field.recipientId);

                                if (!recipient) {
                                    return null;
                                }

                                return (
                                    <button
                                        className={`field-chip ${field.value ? "filled" : ""} ${signingId && field.recipientId === signingId && !field.value ? "active" : ""
                                            } ${signingId && field.recipientId !== signingId && !field.value ? "locked" : ""}`}
                                        key={field.id}
                                        onClick={(event) => {
                                            event.stopPropagation();

                                            if (signingId) {
                                                onFieldActivate(field.id);
                                            }
                                        }}
                                        style={{
                                            background: `${recipient.color}1f`,
                                            borderColor: recipient.color,
                                            color: recipient.color,
                                            height: field.h,
                                            left: `${field.xPct}%`,
                                            top: `${field.yPct}%`,
                                            width: field.w
                                        }}
                                        type="button"
                                    >
                                        <span className="field-chip-copy">
                                            <strong>{field.value || DEFAULTS[field.type].label}</strong>
                                            <small>{field.value ? "Completed" : recipient.name}</small>
                                        </span>
                                        {canEdit ? (
                                            <span
                                                className="field-chip-remove"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onRemoveField(field.id);
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                ✕
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        <div className="field-summary">
                            <strong>Assigned fields on this page:</strong>
                            <ul>
                                {fields.filter((field) => field.page === index).length === 0 ? (
                                    <li>No fields placed yet.</li>
                                ) : (
                                    fields
                                        .filter((field) => field.page === index)
                                        .map((field) => (
                                            <li key={field.id}>
                                                {field.type} for {recipients.find((recipient) => recipient.id === field.recipientId)?.name || "Unknown signer"}
                                            </li>
                                        ))
                                )}
                            </ul>
                        </div>
                        <div className="pg-num">Page {index + 1} of {PAGE_HTML.length}</div>
                    </article>
                ))}
            </div>
        </section>
    );
}
