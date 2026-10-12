import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bars } from "../components/Bars";
import { Empty, Lamp, PageHeader, Panel, Spinner, ToolName, cx } from "../components/ui";
import { get, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ms, num, pct } from "../lib/format";
import type { Server, Stats } from "../lib/types";
import { useState } from "react";

const windows = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

export function Overview() {
  const { me } = useAuth();
  const isAdmin = me?.user.role === "admin";
  const [hours, setHours] = useState(24);
  const servers = useQuery({ queryKey: ["servers"], queryFn: () => get<{ servers: Server[] }>("/api/servers"), refetchInterval: 15_000 });
  const stats = useQuery({ queryKey: ["stats", hours], queryFn: () => get<Stats>(`/api/stats${qs({ hours })}`), refetchInterval: 30_000 });
  const s = stats.data;

  return (
    <>
      <PageHeader title={`Hello, ${me?.user.name.split(" ")[0]}`} sub={isAdmin ? "Everything the team's tools are doing, and whether the servers behind them are healthy." : "Your tool calls, and which servers are up."} />

      <Panel className="mb-6">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg">Servers</h2>
          <Link to="/servers" className="text-sm font-medium text-accent hover:underline">Manage servers</Link>
        </div>
        {servers.isLoading ? <Spinner /> : servers.data?.servers.length === 0 ? (
          <Empty title="No servers yet" action={isAdmin ? <Link to="/servers" className="text-accent underline">Add the first server</Link> : undefined}>
            {isAdmin ? "Add an MCP server to start exposing tools." : "An admin needs to connect a server before there are tools to use."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {servers.data?.servers.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
                <span className="w-44 min-w-0">
                  <span className="block truncate font-medium">{v.name}</span>
                  <ToolName name={`${v.slug}__`} className="text-xs" />
                </span>
                <Lamp status={v.status} />
                <span className="text-sm text-muted">{v.toolCount ?? 0} tools</span>
                {v.status === "unreachable" && v.statusReason && <span className="min-w-0 flex-1 truncate text-sm text-bad" title={v.statusReason}>{v.statusReason}</span>}
                {!!v.quarantinedTools && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">{v.quarantinedTools} awaiting review</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg">{isAdmin ? "Team activity" : "Your activity"}</h2>
        <div className="inline-flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Time window">
          {windows.map((w) => (
            <button key={w.hours} onClick={() => setHours(w.hours)} aria-pressed={hours === w.hours} className={cx("rounded px-3 py-1 text-sm", hours === w.hours ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {stats.isLoading || !s ? <Spinner /> : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
            {[
              ["Tool calls", num(s.totals.calls)],
              ["Failure rate", pct(s.totals.failures, s.totals.calls)],
              ["Median / p95 latency", `${ms(s.totals.p50)} / ${ms(s.totals.p95)}`],
              [isAdmin ? "Active people" : "Servers used", num(isAdmin ? s.activeUsers : s.perServer.length)],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface p-4">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-4 lg:col-span-2">
              <h3 className="mb-3 text-base">Calls over time</h3>
              <Bars series={s.series} bucket={s.bucket} />
            </Panel>
            <Panel className="p-4">
              <h3 className="mb-3 text-base">Most used tools</h3>
              {s.topTools.length === 0 ? <p className="text-sm text-muted">Nothing called yet. Try the assistant or connect a client.</p> : (
                <ol className="space-y-2">
                  {s.topTools.map((t) => (
                    <li key={t.tool} className="flex items-center justify-between gap-2">
                      <ToolName name={t.tool} />
                      <span className="text-sm tabular-nums text-muted">{num(t.calls)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
