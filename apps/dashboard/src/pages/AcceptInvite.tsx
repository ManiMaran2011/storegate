import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { get, post, qs } from "../lib/api";
import { Button, ErrorNote, Field, Input, Spinner } from "../components/ui";
import { AuthShell } from "./Login";

export function AcceptInvite() {
  const token = useSearchParams()[0].get("token") ?? "";
  const nav = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ["invite", token], queryFn: () => get<{ email: string; role: string }>(`/api/invites/preview${qs({ token })}`), retry: false, enabled: !!token });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post("/api/invites/accept", { token, name, password });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <AuthShell title="Invite link incomplete" sub="This link is missing its token. Ask an admin to send a new invite." children={null} />;
  if (preview.isLoading) return <Spinner />;
  if (preview.error) return <AuthShell title="This invite can't be used" sub={preview.error.message}><p className="text-sm text-muted">Ask an admin to send a new one.</p></AuthShell>;
  return (
    <AuthShell title="Join the team" sub={`You're joining as ${preview.data?.role} with ${preview.data?.email}.`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name"><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Password" hint="At least 12 characters."><Input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {!!error && <ErrorNote error={error} />}
        <Button variant="primary" type="submit" busy={busy} className="w-full">Create account</Button>
      </form>
    </AuthShell>
  );
}
