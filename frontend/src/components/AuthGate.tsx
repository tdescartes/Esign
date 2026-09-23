import { useState } from "react";
import type { AuthUser } from "@esign/shared";
import { logIn, signUp } from "../api";

interface AuthGateProps {
    onAuthenticated: (user: AuthUser) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const user =
                mode === "signup" ? await signUp(email, password, name || undefined) : await logIn(email, password);
            onAuthenticated(user);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to authenticate.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-gate">
            <form className="panel auth-card" onSubmit={(event) => void submit(event)}>
                <h1>Esign</h1>
                <p className="hint">
                    {mode === "login" ? "Sign in to prepare and send documents." : "Create a sender account to get started."}
                </p>

                {mode === "signup" ? (
                    <label className="auth-field">
                        Name
                        <input onChange={(event) => setName(event.target.value)} value={name} />
                    </label>
                ) : null}

                <label className="auth-field">
                    Email
                    <input
                        autoComplete="email"
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        type="email"
                        value={email}
                    />
                </label>

                <label className="auth-field">
                    Password
                    <input
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={8}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type="password"
                        value={password}
                    />
                </label>

                {error ? <p className="error-banner">{error}</p> : null}

                <button className="action primary" disabled={isSubmitting} type="submit">
                    {mode === "login" ? "Sign in" : "Create account"}
                </button>

                <button
                    className="action ghost"
                    onClick={() => {
                        setError(null);
                        setMode(mode === "login" ? "signup" : "login");
                    }}
                    type="button"
                >
                    {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
                </button>
            </form>
        </main>
    );
}
