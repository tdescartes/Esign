interface FieldValueModalProps {
    label: string;
    onCancel: () => void;
    onChange: (value: string) => void;
    onConfirm: () => void;
    open: boolean;
    placeholder: string;
    value: string;
}

export function FieldValueModal({ label, onCancel, onChange, onConfirm, open, placeholder, value }: FieldValueModalProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="modal-backdrop">
            <div className="modal-card">
                <h3>{label}</h3>
                <input
                    autoFocus
                    className="modal-input"
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            onConfirm();
                        }
                    }}
                    placeholder={placeholder}
                    value={value}
                />
                <div className="modal-actions">
                    <button className="action ghost modal-button" onClick={onCancel} type="button">
                        Cancel
                    </button>
                    <button className="action primary modal-button" onClick={onConfirm} type="button">
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
