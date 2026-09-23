import type { Recipient } from "@esign/shared";
import { initials } from "../utils";
import type { WorkspaceView } from "../types";

interface PortalBarProps {
    view: WorkspaceView;
    sent: boolean;
    completed: boolean;
    recipients: Recipient[];
    onChangeView: (view: WorkspaceView) => void;
}

export function PortalBar({ view, sent, completed, recipients, onChangeView }: PortalBarProps) {
    return (
        <div className="portalbar">
            <PortalPill
                active={view === "sender"}
                avatar="🏠"
                avatarBackground="#334155"
                label="Sender"
                sublabel="prepares & sends"
                onClick={() => onChangeView("sender")}
            />

            {recipients.map((recipient) => (
                <PortalPill
                    key={recipient.id}
                    active={view === recipient.id}
                    avatar={initials(recipient.name)}
                    avatarBackground={recipient.color}
                    badge={recipient.status}
                    disabled={!sent}
                    label={recipient.name}
                    onClick={() => sent && onChangeView(recipient.id)}
                />
            ))}

            {completed ? (
                <PortalPill
                    active={view === "cert"}
                    avatar="✓"
                    avatarBackground="#0f9d6b"
                    label="Certificate"
                    onClick={() => onChangeView("cert")}
                />
            ) : null}
        </div>
    );
}

interface PortalPillProps {
    active: boolean;
    avatar: string;
    avatarBackground: string;
    badge?: string;
    disabled?: boolean;
    label: string;
    sublabel?: string;
    onClick: () => void;
}

function PortalPill({ active, avatar, avatarBackground, badge, disabled, label, sublabel, onClick }: PortalPillProps) {
    return (
        <button aria-current={active} className="pill" disabled={disabled} onClick={onClick} type="button">
            <span className="av" style={{ background: avatarBackground }}>
                {avatar}
            </span>
            <span className="pill-copy">
                <strong>{label}</strong>
                {sublabel ? <small>{sublabel}</small> : null}
            </span>
            {badge ? <span className={`badge ${badge}`}>{badge}</span> : null}
        </button>
    );
}
