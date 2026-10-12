import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Badge, Button, CopyButton, Dialog, Empty, ErrorNote, Field, Input, PageHeader, Panel, Select, Spinner, Table, Td, Th, useToast } from "../components/ui";
import { del, get, post } from "../lib/api";
import { ago, when } from "../lib/format";
import type { ApiKey } from "../lib/types";

function status(k: ApiKey) {
  if (k.revokedAt) return <Badge tone="bad">Revoked</Badge>;
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return <Badge tone="warn">Expired</Badge>;
  return <Badge tone="ok">Active</Badge>;
}

export function Keys() {
  const qc = useQueryClient();
  const toast = useToast();
  const keys = useQuery({ queryKey: ["keys"], queryFn: () => get<{ keys: ApiKey[] }>("/api/keys") });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState<string>();

  const create = useMutation({
    mutationFn: () => post<{ plaintext: string }>("/api/keys", { name, expiresInDays: days === "never" ? undefined : Number(days) }),
    onSuccess: (r) => {
      setSecret(r.plaintext);
      setName("");
      void qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/keys/${id}`),
    onSuccess: () => {
      toast("Key revoked. It stopped working immediately.");
      void qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => toast(e.message, "bad"),
  });
  const close = () => { setOpen(false); setSecret(undefined); create.reset(); };
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <>
      <PageHeader title="API keys" sub="Keys let your MCP client (Claude Code, Cursor, Inspector) act as you. Each call is checked against your permissions and recorded in the audit log under your name." actions={<Button variant="primary" onClick={() => setOpen(true)}>Create key</Button>} />
      <Panel>
        {keys.isLoading ? <Spinner /> : !keys.data?.keys.length ? (
          <Empty title="No keys yet" action={<Button variant="primary" onClick={() => setOpen(true)}>Create your first key</Button>}>Create a key, then paste it into your client's MCP settings.</Empty>
        ) : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Key</Th><Th>Status</Th><Th>Last used</Th><Th>Expires</Th><Th /></tr></thead>
            <tbody>
              {keys.data.keys.map((k) => (
                <tr key={k.id}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td><code className="font-mono text-[13px] text-muted">{k.prefix}…</code></Td>
                  <Td>{status(k)}</Td>
                  <Td className="text-muted" >{ago(k.lastUsedAt)}</Td>
                  <Td className="text-muted">{k.expiresAt ? when(k.expiresAt) : "Never"}</Td>
                  <Td className="text-right">
                    {!k.revokedAt && <Button variant="danger" busy={revoke.isPending && revoke.variables === k.id} onClick={() => confirm(`Revoke "${k.name}"? Clients using it will be signed out immediately.`) && revoke.mutate(k.id)}>Revoke</Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Dialog open={open} onClose={close} title={secret ? "Copy your key now" : "Create API key"}>
        {secret ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">This is the only time the full key is shown. Storegate keeps just a hash, so a lost key can't be recovered, only replaced.</p>
            <code className="block break-all rounded-md border border-line bg-raised p-3 font-mono text-sm">{secret}</code>
            <div className="flex justify-end gap-2"><CopyButton text={secret} label="Copy key" /><Button variant="primary" onClick={close}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name" hint="Where will you use it? For example “Claude Code on laptop”."><Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Expires">
              <Select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option><option value="never">Never</option>
              </Select>
            </Field>
            {create.error && <ErrorNote error={create.error} />}
            <div className="flex justify-end gap-2"><Button type="button" onClick={close}>Cancel</Button><Button variant="primary" type="submit" busy={create.isPending}>Create key</Button></div>
          </form>
        )}
      </Dialog>
    </>
  );
}
