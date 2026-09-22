export function initials(name: string) {
    return (
        name
            .trim()
            .split(/\s+/)
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
            .toUpperCase() || "?"
    );
}

export function uid(prefix: string) {
    return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}
