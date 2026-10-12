import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Empty, Input, PageHeader, Panel, Select, Spinner, Table, Td, Th, ToolName } from "../components/ui";
import { get, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ms, when } from "../lib/format";
import type { AuditRow, Server, TeamUser } from "../lib/types";

const outcomeTone = (o: string) => (o === "ok" ? "ok" : o === "denied" || o === "quarantined" || o === "rate_limited" ? "warn" : "bad");
const outcomes = ["ok", "tool_error", "error", "timeout", "unavailable", "denied", "quarantined", "rate_limited", "not_found"];


/** The server stores a compact, redacted JSON preview; pretty-print it when it parses, show it verbatim when it was truncated. */
function prettyArgs(preview: string | null): string {
  if (!preview) return "(no arguments)";
  try {
    return JSON.stringify(JSON.parse(preview), null, 2);
  } catch {
    return preview;
  }
}

export function Audit() {
  const { me } = useAuth();
  const isAdmin = me?.user.role === "admin";
  const [f, setF] = useState({ userId: "", server: "", outcome: "", tool: "" });
  const [open, setOpen] = useState<number>();
  const users = useQuery({ queryKey: ["users"], queryFn: () => get<{ users: TeamUser[] }>("/api/users"), enabled: isAdmin });
  const servers = useQuery({ queryKey: ["servers"], queryFn: () => get<{ servers: Server[] }>("/api/servers") });
  const log = useInfiniteQuery({
    queryKey: ["audit", f],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => get<{ rows: AuditRow[]; nextCursor: number | null }>(`/api/audit${qs({ ...f, before: pageParam, limit: 50 })}`),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: 20_000,
  });
  const rows = log.data?.pages.flatMap((p) => p.rows) ?? [];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Audit log" sub={isAdmin ? "Every tool call through the gateway: who made it, from where, and how it ended." : "Your own tool calls. Admins can see everyone's."} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin && (
          <Select aria-label="Person" value={f.userId} onChange={set("userId")}>
            <option value="">Everyone</option>{users.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        <Select aria-label="Server" value={f.server} onChange={set("server")}>
          <option value="">All servers</option>{servers.data?.servers.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </Select>
        <Select aria-label="Outcome" value={f.outcome} onChange={set("outcome")}>
          <option value="">Any outcome</option><option value="failed">Any failure</option>{outcomes.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
        </Select>
        <Input aria-label="Tool name" placeholder="Tool name contains…" value={f.tool} onChange={set("tool")} />
      </div>
      <Panel>
        {log.isLoading ? <Spinner /> : rows.length === 0 ? <Empty title="Nothing matches">Calls appear here as soon as someone uses a tool.</Empty> : (
          <Table>
            <thead><tr><Th>When</Th>{isAdmin && <Th>Person</Th>}<Th>Tool</Th><Th>Via</Th><Th>Outcome</Th><Th>Time</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <>
                  <tr key={r.id} className="cursor-pointer hover:bg-raised/60" onClick={() => setOpen(open === r.id ? undefined : r.id)}>
                    <Td className="whitespace-nowrap text-muted">{when(r.ts)}</Td>
                    {isAdmin && <Td>{r.userEmail ?? "—"}</Td>}
                    <Td>{r.exposedName ? <ToolName name={r.exposedName} /> : <span className="text-muted">—</span>}</Td>
                    <Td className="text-muted">{r.via === "chat" ? "Assistant" : (r.clientName?.split("/")[0] ?? "API key")}{r.keyPrefix && r.via !== "chat" ? ` · ${r.keyPrefix}…` : ""}</Td>
                    <Td><Badge tone={outcomeTone(r.outcome)}>{r.outcome.replace("_", " ")}</Badge></Td>
                    <Td className="tabular-nums text-muted">{ms(r.durationMs)}</Td>
                  </tr>
                  {open === r.id && (
                    <tr key={`${r.id}-d`}><td colSpan={isAdmin ? 6 : 5} className="border-b border-line bg-raised/50 px-4 py-3 text-sm">
                      {r.errorMessage && <p className="mb-2 text-bad">{r.errorMessage}</p>}
                      <p className="mb-1 text-xs text-muted">Arguments (secrets are redacted before they are stored)</p>
                      <pre className="overflow-x-auto rounded border border-line bg-surface p-2 font-mono text-xs">{prettyArgs(r.argsPreview)}</pre>
                    </td></tr>
                  )}
                </>
              ))}
            </tbody>
          </Table>
        )}
        {log.hasNextPage && <div className="border-t border-line p-3 text-center"><Button busy={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>Load older calls</Button></div>}
      </Panel>
    </>
  );
}
