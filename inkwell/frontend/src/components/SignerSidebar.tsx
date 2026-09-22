import type { Recipient } from "@inkwell/shared";
import type { WorkspaceField } from "../types";

interface SignerSidebarProps {
    consentChecked: boolean;
    fields: WorkspaceField[];
    onBack: () => void;
    onConsentChange: (checked: boolean) => void;
    onFinish: () => void;
    recipient: Recipient;
}

export function SignerSidebar({
    consentChecked,
    fields,
    onBack,
    onConsentChange,
    onFinish,
    recipient
}: SignerSidebarProps) {
    const done = fields.filter((field) => field.value).length;
    const signed = recipient.status === "signed";
    const progress = fields.length ? (done / fields.length) * 100 : 0;
    const canFinish = !signed && fields.length > 0 && done === fields.length && consentChecked;

    return (
        <div>
            <div className="portal-banner">
                <span>Opened via</span>
                <code>inkwell.demo/s/{recipient.id.slice(0, 10)}</code>
            </div>
            <h2>{recipient.name}&apos;s portal</h2>
            <p className="hint">
                {signed
                    ? "You have completed your part of this document."
                    : `Complete the highlighted ${recipient.color} fields on the page. Only your fields are active.`}
            </p>

            <div className="label">Your progress</div>
            <div className="progress">
                <div className="bar">
                    <i style={{ background: recipient.color, width: `${progress}%` }} />
                </div>
                <small>
                    {done} of {fields.length} field{fields.length === 1 ? "" : "s"} complete
                </small>
            </div>

            {signed ? (
                <div className="note-box success">Signed. You can switch to another portal from the bar above.</div>
            ) : (
                <>
                    <label className="consent-box">
                        <input
                            checked={consentChecked}
                            onChange={(event) => onConsentChange(event.target.checked)}
                            type="checkbox"
                        />
                        <span>
                            I, <strong>{recipient.name}</strong>, agree to sign electronically and that my e-signature is
                            legally binding under the ESIGN Act and UETA.
                        </span>
                    </label>
                    <button className="action primary" disabled={!canFinish} onClick={onFinish} type="button">
                        Finish my signing
                    </button>
                </>
            )}

            <button className="action ghost" onClick={onBack} type="button">
                Back to sender view
            </button>
        </div>
    );
}
