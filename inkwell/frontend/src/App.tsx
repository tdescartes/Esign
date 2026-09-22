import { useEffect, useState } from "react";
import type { CertificateResponse, RecipientStatus } from "@inkwell/shared";
import { completeSigning, createDocument, fillField, getCertificate, getHealth, openPortal, sendDocument } from "./api";
import { CertificateView } from "./components/CertificateView";
import { DocumentCanvas } from "./components/DocumentCanvas";
import { FieldValueModal } from "./components/FieldValueModal";
import { PortalBar } from "./components/PortalBar";
import { SenderSidebar } from "./components/SenderSidebar";
import { SignerSidebar } from "./components/SignerSidebar";
import { COLORS, DEFAULTS, PAGE_HTML } from "./constants";
import type { WorkspaceField, WorkspaceRecipient, WorkspaceState } from "./types";
import { uid } from "./utils";

type HealthState =
    | { status: "loading" }
    | { status: "ready"; service: string }
    | { status: "error"; message: string };

const starterRecipients: WorkspaceRecipient[] = [
    {
        id: "sender-demo-1",
        name: "Maya Chen",
        email: "maya@example.com",
        color: "#0f9d6b",
        status: "draft",
        signingOrder: 0,
        signingUrl: null
    },
    {
        id: "sender-demo-2",
        name: "Sam Okafor",
        email: "sam@example.com",
        color: "#2563eb",
        status: "draft",
        signingOrder: 0,
        signingUrl: null
    }
];

const starterFields: WorkspaceField[] = [
    {
        id: "field-demo-1",
        recipientId: "sender-demo-1",
        type: "signature",
        page: 1,
        xPct: 12,
        yPct: 62,
        w: 190,
        h: 52,
        required: true,
        value: null
    },
    {
        id: "field-demo-2",
        recipientId: "sender-demo-2",
        type: "signature",
        page: 1,
        xPct: 54,
        yPct: 62,
        w: 190,
        h: 52,
        required: true,
        value: null
    }
];

export function App() {
    const [certificate, setCertificate] = useState<CertificateResponse | null>(null);
    const [health, setHealth] = useState<HealthState>({ status: "loading" });
    const [isCertificateLoading, setIsCertificateLoading] = useState(false);
    const [consentByRecipient, setConsentByRecipient] = useState<Record<string, boolean>>({});
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [modalState, setModalState] = useState<{ fieldId: string; label: string; value: string } | null>(null);
    const [workspace, setWorkspace] = useState<WorkspaceState>({
        documentId: null,
        view: "sender",
        sent: false,
        completed: false,
        placeType: null,
        placeRecipient: starterRecipients[0]?.id || null,
        recipients: starterRecipients,
        fields: starterFields
    });

    useEffect(() => {
        let cancelled = false;

        getHealth()
            .then((result) => {
                if (!cancelled) {
                    setHealth({ status: "ready", service: result.service });
                }
            })
            .catch((error: Error) => {
                if (!cancelled) {
                    setHealth({ status: "error", message: error.message });
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const updateRecipient = (recipientId: string, field: "name" | "email", value: string) => {
        setWorkspace((current) => ({
            ...current,
            recipients: current.recipients.map((recipient) =>
                recipient.id === recipientId
                    ? {
                        ...recipient,
                        [field]: value
                    }
                    : recipient
            )
        }));
    };

    const addRecipient = () => {
        setWorkspace((current) => {
            const nextIndex = current.recipients.length % COLORS.length;
            const recipient: WorkspaceRecipient = {
                id: uid("recipient-"),
                name: `Signer ${current.recipients.length + 1}`,
                email: "",
                color: COLORS[nextIndex],
                status: "draft",
                signingOrder: 0,
                signingUrl: null
            };

            return {
                ...current,
                documentId: current.documentId,
                placeRecipient: current.placeRecipient || recipient.id,
                recipients: [...current.recipients, recipient]
            };
        });
    };

    const removeRecipient = (recipientId: string) => {
        setWorkspace((current) => {
            if (current.recipients.length <= 1) {
                return current;
            }

            const recipients = current.recipients.filter((recipient) => recipient.id !== recipientId);

            return {
                ...current,
                placeRecipient:
                    current.placeRecipient === recipientId ? (recipients[0]?.id ?? null) : current.placeRecipient,
                recipients,
                fields: current.fields.filter((field) => field.recipientId !== recipientId)
            };
        });
    };

    const sendDraft = async () => {
        if (!workspace.fields.length) {
            setErrorMessage("Add at least one field before sending.");
            return;
        }

        setErrorMessage(null);
        setIsSyncing(true);

        try {
            const created = await createDocument({
                title: "Agreement",
                pages: PAGE_HTML,
                recipients: workspace.recipients.map((recipient) => ({
                    name: recipient.name,
                    email: recipient.email,
                    color: recipient.color,
                    signingOrder: recipient.signingOrder
                })),
                fields: workspace.fields.map((field) => ({
                    recipientIndex: workspace.recipients.findIndex((recipient) => recipient.id === field.recipientId),
                    type: field.type,
                    page: field.page,
                    xPct: field.xPct,
                    yPct: field.yPct,
                    w: field.w,
                    h: field.h,
                    required: field.required
                }))
            });
            const sent = await sendDocument(created.id);

            setWorkspace((current) => ({
                ...current,
                documentId: created.id,
                sent: true,
                recipients: created.recipients.map((recipient) => ({
                    ...recipient,
                    signingUrl:
                        sent.links.find((link) => link.recipient === recipient.name && link.email === recipient.email)
                            ?.signingUrl || null,
                    portalToken:
                        sent.links.find((link) => link.recipient === recipient.name && link.email === recipient.email)
                            ?.signingUrl.split("/")
                            .pop() || undefined,
                    status: "sent"
                })),
                fields: created.fields
            }));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Unable to send document.");
        } finally {
            setIsSyncing(false);
        }
    };

    const changeView = async (view: WorkspaceState["view"]) => {
        if (view === "sender" || view === "cert") {
            setWorkspace((current) => ({ ...current, view }));
            return;
        }

        const recipient = workspace.recipients.find((candidate) => candidate.id === view);
        if (!recipient?.portalToken) {
            setErrorMessage("Missing signer portal token.");
            return;
        }

        setErrorMessage(null);
        setIsSyncing(true);

        try {
            const portal = await openPortal(recipient.portalToken);
            setWorkspace((current) => ({
                ...current,
                view,
                recipients: current.recipients.map((entry) =>
                    entry.id === view ? { ...entry, status: portal.me.status } : entry
                ),
                fields: current.fields.map((field) => {
                    const remoteField = portal.fields.find((candidate) => candidate.id === field.id);
                    return remoteField
                        ? {
                            ...field,
                            value: remoteField.value
                        }
                        : field;
                })
            }));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Unable to open signer portal.");
        } finally {
            setIsSyncing(false);
        }
    };

    const addField = (page: number, xPct: number, yPct: number) => {
        setWorkspace((current) => {
            if (!current.placeType || !current.placeRecipient || current.sent || current.view !== "sender") {
                return current;
            }

            const defaults = DEFAULTS[current.placeType];
            const nextField: WorkspaceField = {
                id: uid("field-"),
                recipientId: current.placeRecipient,
                type: current.placeType,
                page,
                xPct,
                yPct,
                w: defaults.w,
                h: defaults.h,
                required: true,
                value: null
            };

            return {
                ...current,
                fields: [...current.fields, nextField]
            };
        });
    };

    const removeField = (fieldId: string) => {
        setWorkspace((current) => ({
            ...current,
            fields: current.fields.filter((field) => field.id !== fieldId)
        }));
    };

    const setFieldValue = async (fieldId: string, value: string, valueHTML?: string) => {
        if (workspace.view === "sender" || workspace.view === "cert") {
            return;
        }

        const recipient = workspace.recipients.find((candidate) => candidate.id === workspace.view);
        if (!recipient?.portalToken) {
            setErrorMessage("Missing signer portal token.");
            return;
        }

        setErrorMessage(null);

        try {
            await fillField(recipient.portalToken, fieldId, value);
            setWorkspace((current) => ({
                ...current,
                fields: current.fields.map((field) =>
                    field.id === fieldId
                        ? {
                            ...field,
                            value,
                            valueHTML
                        }
                        : field
                )
            }));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Unable to save field value.");
        }
    };

    const activateField = (fieldId: string) => {
        if (workspace.view === "sender" || workspace.view === "cert") {
            return;
        }

        const field = workspace.fields.find((candidate) => candidate.id === fieldId);
        const recipient = workspace.recipients.find((candidate) => candidate.id === workspace.view);

        if (!field || !recipient || field.recipientId !== recipient.id || recipient.status === "signed") {
            return;
        }

        if (field.type === "date") {
            void setFieldValue(field.id, new Date().toLocaleDateString());
            return;
        }

        if (field.type === "check") {
            void setFieldValue(field.id, field.value ? "" : "☑");
            return;
        }

        if (field.type === "name") {
            void setFieldValue(field.id, recipient.name);
            return;
        }

        const presetValue =
            field.value ||
            (field.type === "signature" || field.type === "initials"
                ? recipient.name
                : field.type === "text"
                    ? ""
                    : "");

        setModalState({
            fieldId: field.id,
            label: field.type === "signature" ? "Add your signature" : `Enter ${DEFAULTS[field.type].label.toLowerCase()}`,
            value: presetValue
        });
    };

    const finishSigning = async () => {
        if (workspace.view === "sender" || workspace.view === "cert") {
            return;
        }

        const signerId = workspace.view;
        const signerFields = workspace.fields.filter((field) => field.recipientId === signerId);
        const signer = workspace.recipients.find((recipient) => recipient.id === signerId);

        if (!signer?.portalToken || !consentByRecipient[signerId] || !signerFields.length || signerFields.some((field) => !field.value)) {
            return;
        }

        setErrorMessage(null);
        setIsSyncing(true);

        try {
            const result = await completeSigning(signer.portalToken, true);
            let nextCertificate: CertificateResponse | null = null;

            if (result.status === "completed" && workspace.documentId) {
                setIsCertificateLoading(true);
                nextCertificate = await getCertificate(workspace.documentId);
            }

            setWorkspace((current) => {
                const recipients = current.recipients.map((recipient) =>
                    recipient.id === signerId
                        ? { ...recipient, status: "signed" as RecipientStatus }
                        : recipient
                );
                const completed = result.status === "completed" || recipients.every((recipient) => recipient.status === "signed");

                return {
                    ...current,
                    completed,
                    recipients,
                    view: completed ? "cert" : "sender"
                };
            });

            if (nextCertificate) {
                setCertificate(nextCertificate);
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Unable to complete signing.");
        } finally {
            setIsCertificateLoading(false);
            setIsSyncing(false);
        }
    };

    const activeSigner =
        workspace.view !== "sender" && workspace.view !== "cert"
            ? workspace.recipients.find((recipient) => recipient.id === workspace.view) || null
            : null;
    const signerFields = activeSigner
        ? workspace.fields.filter((field) => field.recipientId === activeSigner.id)
        : [];

    return (
        <main className="app-shell">
            <section className="hero-card">
                <div className="eyebrow">InkWell migration workspace</div>
                <h1>React frontend in place, Express API preserved.</h1>
                <p>
                    This shell is the first migration checkpoint: the frontend now has a typed build pipeline,
                    shared contracts, and a stable API probe while the legacy sender and signer demo remains
                    available for parity work.
                </p>
                <div className="status-row">
                    <span className={`status-pill ${health.status}`}>API {health.status}</span>
                    {health.status === "ready" && <span>{health.service}</span>}
                    {health.status === "error" && <span>{health.message}</span>}
                    {health.status === "loading" && <span>Checking backend...</span>}
                    {isSyncing ? <span>Syncing…</span> : null}
                </div>
                {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
            </section>

            <PortalBar
                completed={workspace.completed}
                onChangeView={(view) => {
                    void changeView(view);
                }}
                recipients={workspace.recipients}
                sent={workspace.sent}
                view={workspace.view}
            />

            <section className="workspace-layout">
                {workspace.view === "cert" ? (
                    <CertificateView certificate={certificate} isLoading={isCertificateLoading} />
                ) : (
                    <>
                        <aside className="panel sidebar-panel">
                            {activeSigner ? (
                                <SignerSidebar
                                    consentChecked={Boolean(consentByRecipient[activeSigner.id])}
                                    fields={signerFields}
                                    onBack={() => changeView("sender")}
                                    onConsentChange={(checked) =>
                                        setConsentByRecipient((current) => ({ ...current, [activeSigner.id]: checked }))
                                    }
                                    onFinish={() => {
                                        void finishSigning();
                                    }}
                                    recipient={activeSigner}
                                />
                            ) : (
                                <SenderSidebar
                                    fieldsCount={workspace.fields.length}
                                    onAddRecipient={addRecipient}
                                    onRecipientChange={updateRecipient}
                                    onRemoveRecipient={removeRecipient}
                                    onSelectPlaceRecipient={(recipientId) =>
                                        setWorkspace((current) => ({ ...current, placeRecipient: recipientId }))
                                    }
                                    onSelectPlaceType={(placeType) => setWorkspace((current) => ({ ...current, placeType }))}
                                    onSend={() => {
                                        void sendDraft();
                                    }}
                                    placeRecipient={workspace.placeRecipient}
                                    placeType={workspace.placeType}
                                    recipients={workspace.recipients}
                                    sent={workspace.sent}
                                />
                            )}
                        </aside>

                        <DocumentCanvas
                            canEdit={workspace.view === "sender" && !workspace.sent}
                            fields={workspace.fields}
                            onAddField={addField}
                            onFieldActivate={activateField}
                            onRemoveField={removeField}
                            placeType={workspace.placeType}
                            recipients={workspace.recipients}
                            view={workspace.view}
                        />
                    </>
                )}
            </section>

            <article className="panel panel-wide">
                <h2>Legacy parity reference</h2>
                <p>
                    The original single-file demo is preserved at <code>/legacy-demo.html</code>. Use it as the
                    behavioral reference while porting the editor, signer portal, and certificate flow.
                </p>
                <div className="callout">
                    This slice restores click-to-place sender fields and visual overlays. The next slice should port
                    signer-only field interaction and the signature modal flow.
                </div>
            </article>

            <FieldValueModal
                label={modalState?.label || "Edit field"}
                onCancel={() => setModalState(null)}
                onChange={(value) =>
                    setModalState((current) => (current ? { ...current, value } : current))
                }
                onConfirm={() => {
                    if (!modalState) {
                        return;
                    }

                    void setFieldValue(modalState.fieldId, modalState.value || "");
                    setModalState(null);
                }}
                open={Boolean(modalState)}
                placeholder="Enter a value"
                value={modalState?.value || ""}
            />
        </main>
    );
}
