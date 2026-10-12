import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Badge, Button, CopyButton, Dialog, Empty, ErrorNote, Field, Input, PageHeader, Panel, Select, Spinner, Table, Td, Th, useToast } from "../components/ui";
import { del, get, patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, when } from "../lib/format";
import type { Invite, Role, TeamUser } from "../lib/types";

export function Team() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: () => get<{ users: TeamUser[] }>("/api/users") });
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => get<{ invites: Invite[] }>("/api/invites") });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string>();

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["users"] }); void qc.invalidateQueries({ queryKey: ["invites"] }); };
  const invite = useMutation({
    mutationFn: () => post<{ inviteUrl: string }>("/api/invites", { email, role }),
    onSuccess: (r) => { setLink(r.inviteUrl); refresh(); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; disabled?: boolean }) => patch(`/api/users/${id}`, body),
    onSuccess: () => { toast("Saved"); refresh(); },
    onError: (e) => toast(e.message, "bad"),
  });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/api/invites/${id}`), onSuccess: refresh, onError: (e) => toast(e.message, "bad") });
  const close = () => { setOpen(false); setLink(undefined); setEmail(""); invite.reset(); };
  const submit = (e: FormEvent) => { e.preventDefault(); invite.mutate(); };
  const pending = invites.data?.invites.filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date()) ?? [];

  return (
    <>
      <PageHeader title="Team" sub="Admins manage servers, people and permissions. Members use the tools they've been allowed." actions={<Button variant="primary" onClick={() => setOpen(true)}>Invite someone</Button>} />
      <Panel className="mb-6">
        {users.isLoading ? <Spinner /> : (
          <Table>
            <thead><tr><Th>Person</Th><Th>Role</Th><Th>Active keys</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {users.data?.users.map((u) => {
                const self = u.id === me?.user.id;
                return (
                  <tr key={u.id}>
                    <Td><span className="block font-medium">{u.name}{self && <span className="ml-2 text-xs font-normal text-muted">you</span>}</span><span className="text-xs text-muted">{u.email}</span></Td>
                    <Td>
                      <Select aria-label={`Role for ${u.name}`} className="w-32" value={u.role} disabled={self} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}>
                        <option value="member">Member</option><option value="admin">Admin</option>
                      </Select>
                    </Td>
                    <Td>{u.activeKeys}</Td>
                    <Td>{u.disabled ? <Badge tone="bad">Disabled</Badge> : <Badge tone="ok">Active</Badge>}</Td>
                    <Td className="text-right">
                      {!self && <Button variant={u.disabled ? "secondary" : "danger"} onClick={() => (u.disabled || confirm(`Disable ${u.name}? Their sessions and API keys stop working immediately.`)) && update.mutate({ id: u.id, disabled: !u.disabled })}>{u.disabled ? "Enable" : "Disable"}</Button>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <h2 className="mb-3 text-lg">Pending invites</h2>
      <Panel>
        {pending.length === 0 ? <Empty title="No pending invites">Invite links expire after a few days and work once.</Empty> : (
          <Table>
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Invited by</Th><Th>Expires</Th><Th /></tr></thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.id}><Td>{i.email}</Td><Td>{i.role}</Td><Td className="text-muted">{i.invitedByEmail ?? "—"}</Td><Td className="text-muted" >{when(i.expiresAt)} ({ago(i.expiresAt)})</Td>
                  <Td className="text-right"><Button variant="danger" onClick={() => revoke.mutate(i.id)}>Revoke</Button></Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Dialog open={open} onClose={close} title={link ? "Send this link" : "Invite someone"}>
        {link ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Share this link with {email || "them"}. It's shown once and works once. Storegate doesn't send email.</p>
            <code className="block break-all rounded-md border border-line bg-raised p-3 font-mono text-sm">{link}</code>
            <div className="flex justify-end gap-2"><CopyButton text={link} label="Copy link" /><Button variant="primary" onClick={close}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
            <Field label="Role" hint="Members start with read-only access to trusted servers. You can widen that under Servers."><Select value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="member">Member</option><option value="admin">Admin</option></Select></Field>
            {invite.error && <ErrorNote error={invite.error} />}
            <div className="flex justify-end gap-2"><Button type="button" onClick={close}>Cancel</Button><Button variant="primary" type="submit" busy={invite.isPending}>Create invite</Button></div>
          </form>
        )}
      </Dialog>
    </>
  );
}
