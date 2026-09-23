import type { CertificateResponse } from "@esign/shared";

interface CertificateViewProps {
    certificate: CertificateResponse | null;
    isLoading: boolean;
}

export function CertificateView({ certificate, isLoading }: CertificateViewProps) {
    if (isLoading) {
        return <section className="panel panel-wide">Loading certificate...</section>;
    }

    if (!certificate) {
        return <section className="panel panel-wide">Certificate is not available yet.</section>;
    }

    return (
        <section className="panel panel-wide cert-shell">
            <div className="sealbar">
                <span className="seal">✓</span>
                <div>
                    <div className="seal-title">Document completed and sealed</div>
                    <div className="hint">
                        Every signer completed their portal. The API returned a tamper-evident hash and audit trail.
                    </div>
                </div>
            </div>

            <div className="cert-grid">
                <div>
                    <h2>Certificate of completion</h2>
                    <div className="kv-list">
                        <div>
                            <span className="k">Document</span>
                            <span className="v">{certificate.document}</span>
                        </div>
                        <div>
                            <span className="k">Envelope ID</span>
                            <span className="v">{certificate.envelopeId}</span>
                        </div>
                        <div>
                            <span className="k">Completed</span>
                            <span className="v">{new Date(certificate.completedAt).toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="k">Signers</span>
                            <span className="v">{certificate.signers.map((signer) => signer.name).join(", ")}</span>
                        </div>
                    </div>

                    <div className="label">Document integrity</div>
                    <div className="hashbox">{certificate.sealedHash}</div>
                </div>

                <div>
                    <h2>Audit trail</h2>
                    <ul className="audit-list">
                        {certificate.audit.map((entry) => (
                            <li key={`${entry.created_at}-${entry.event}-${entry.actor || "system"}`}>
                                <div className="audit-time">{new Date(entry.created_at).toLocaleString()}</div>
                                <div className="audit-event">{entry.event}</div>
                                {entry.actor ? <div className="audit-meta">{entry.actor}</div> : null}
                                {entry.meta ? <div className="audit-meta">{entry.meta}</div> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}