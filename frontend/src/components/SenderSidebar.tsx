import type { FieldType, Recipient } from "@esign/shared";
import { DEFAULTS } from "../constants";
import { initials } from "../utils";

interface SenderSidebarProps {
    fieldsCount: number;
    pdfFile: File | null;
    placeRecipient: string | null;
    placeType: FieldType | null;
    recipients: Recipient[];
    sent: boolean;
    onAddRecipient: () => void;
    onRecipientChange: (recipientId: string, field: "name" | "email", value: string) => void;
    onRemoveRecipient: (recipientId: string) => void;
    onSelectPdfFile: (file: File | null) => void;
    onSelectPlaceRecipient: (recipientId: string) => void;
    onSelectPlaceType: (fieldType: FieldType | null) => void;
    onSend: () => void;
}

export function SenderSidebar({
    fieldsCount,
    pdfFile,
    placeRecipient,
    placeType,
    recipients,
    sent,
    onAddRecipient,
    onRecipientChange,
    onRemoveRecipient,
    onSelectPdfFile,
    onSelectPlaceRecipient,
    onSelectPlaceType,
    onSend
}: SenderSidebarProps) {
    if (sent) {
        return (
            <div>
                <h2>Sending status</h2>
                <p className="hint">
                    The sender shell is migrated. The next slice will port the dashboard actions and signer portal state.
                </p>
                <div className="dashboard-list">
                    {recipients.map((recipient) => (
                        <div className="dash-item" key={recipient.id}>
                            <div className="dash-top">
                                <span className="av" style={{ background: recipient.color }}>
                                    {initials(recipient.name)}
                                </span>
                                <span className="nm">{recipient.name}</span>
                                <span className={`badge ${recipient.status}`}>{recipient.status}</span>
                            </div>
                            <div className="hint-line">{recipient.email || "no email"}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <h2>Compose &amp; send</h2>
            <p className="hint">
                You are the sender. Add signers, choose who a field belongs to, then prepare the page canvas for field placement.
            </p>

            <div className="label">Signers</div>
            <div className="reclist">
                {recipients.map((recipient) => (
                    <div className="rec-item" key={recipient.id}>
                        <span className="av" style={{ background: recipient.color }}>
                            {initials(recipient.name)}
                        </span>
                        <div className="meta">
                            <input
                                onChange={(event) => onRecipientChange(recipient.id, "name", event.target.value)}
                                value={recipient.name}
                            />
                            <input
                                className="email"
                                onChange={(event) => onRecipientChange(recipient.id, "email", event.target.value)}
                                placeholder="email@example.com"
                                value={recipient.email || ""}
                            />
                        </div>
                        <button className="x" onClick={() => onRemoveRecipient(recipient.id)} type="button">
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            <button className="action ghost" onClick={onAddRecipient} type="button">
                + Add signer
            </button>

            <div className="label">Place a field for</div>
            <select
                className="select"
                onChange={(event) => onSelectPlaceRecipient(event.target.value)}
                value={placeRecipient || ""}
            >
                {recipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                        {recipient.name}
                    </option>
                ))}
            </select>

            <div className="palette">
                {Object.entries(DEFAULTS).map(([fieldType, config]) => {
                    const active = placeType === fieldType;

                    return (
                        <button
                            className={`tool ${active ? "active" : ""}`}
                            key={fieldType}
                            onClick={() => onSelectPlaceType(active ? null : (fieldType as FieldType))}
                            type="button"
                        >
                            <span className="tool-label">{config.label}</span>
                            <small>
                                {config.w}×{config.h}
                            </small>
                        </button>
                    );
                })}
            </div>

            <p className="hint">
                Pick a field, then click on the document page to place it. Use the overlay close control to remove a field.
            </p>

            <div className="label">Real PDF (optional)</div>
            <input
                accept="application/pdf"
                onChange={(event) => onSelectPdfFile(event.target.files?.[0] || null)}
                type="file"
            />
            <p className="hint">
                {pdfFile
                    ? `${pdfFile.name} will be uploaded and flattened with signer values when sent.`
                    : "Without a PDF, the preview text above is used and a canonical-hash seal is produced instead."}
            </p>

            <button className="action primary" disabled={fieldsCount === 0} onClick={onSend} type="button">
                Send to {recipients.length} signer{recipients.length === 1 ? "" : "s"} →
            </button>
        </div>
    );
}
