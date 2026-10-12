import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { post } from "../lib/api";
import { Button, ErrorNote, Field, Input } from "../components/ui";

export function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-ink" aria-hidden>
            <svg viewBox="0 0 16 16" className="size-5" fill="currentColor"><path d="M2 11V3h2v8zm4-8h2v8H6zm4 3h2v5h-2z" /></svg>
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">Storegate</span>
        </div>
        <h1 className="text-3xl">{title}</h1>
        <p className="mb-6 mt-1 text-muted">{sub}</p>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post("/api/auth/login", { email, password });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Sign in" sub="One gateway for your store's tools and your team's AI clients.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {!!error && <ErrorNote error={error} />}
        <Button variant="primary" type="submit" busy={busy} className="w-full">Sign in</Button>
        <p className="text-sm text-muted">New here? Ask an admin for an invite link.</p>
      </form>
    </AuthShell>
  );
}
