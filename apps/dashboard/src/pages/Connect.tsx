import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CopyButton, PageHeader, Panel, Spinner, ToolName } from "../components/ui";
import { get } from "../lib/api";
import type { GatewayInfo } from "../lib/types";

function Snippet({ title, note, code }: { title: string; note?: string; code: string }) {
  return (
    <Panel className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-base">{title}</h3><CopyButton text={code} /></div>
      {note && <p className="mb-2 text-sm text-muted">{note}</p>}
      <pre className="overflow-x-auto rounded border border-line bg-raised p-3 font-mono text-[13px] leading-relaxed">{code}</pre>
    </Panel>
  );
}

export function Connect() {
  const info = useQuery({ queryKey: ["gateway"], queryFn: () => get<GatewayInfo>("/api/gateway") });
  if (info.isLoading || !info.data) return <Spinner />;
  const g = info.data;
  const KEY = "<your-api-key>";
  return (
    <>
      <PageHeader title="Connect a client" sub={<>Point any MCP client at one URL. You'll see {g.toolCount} tools; <Link to="/keys" className="text-accent underline">create an API key</Link> first.</>} />
      <div className="grid gap-4">
        <Snippet title="Claude Code" code={`claude mcp add --transport http storegate ${g.mcpUrl} \\\n  --header "Authorization: Bearer ${KEY}"`} />
        <Snippet title="Cursor / any client with a JSON config" code={JSON.stringify({ mcpServers: { storegate: { url: g.mcpUrl, headers: { Authorization: `Bearer ${KEY}` } } } }, null, 2)} />
        <Snippet title="MCP Inspector" code={`npx @modelcontextprotocol/inspector\n# Transport: Streamable HTTP\n# URL: ${g.mcpUrl}\n# Header: Authorization = Bearer ${KEY}`} />
        <Snippet title="Smaller context: search-then-call mode" note={`With many tools, listing them all uses a lot of the model's context. This endpoint exposes three tools (search, describe, call) and loads the rest on demand. The built-in assistant switches to it automatically above ${g.lazyThreshold} tools.`} code={g.lazyMcpUrl} />
      </div>
      <h2 className="mb-3 mt-8 text-lg">Tools you can use ({g.toolCount})</h2>
      <Panel>
        {g.tools.length === 0 ? <p className="p-6 text-sm text-muted">No tools are available to you yet. An admin may need to grant access.</p> : (
          <ul className="divide-y divide-line">
            {g.tools.map((t) => (
              <li key={t.name} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2">
                <span className="w-64 shrink-0"><ToolName name={t.name} /></span>
                <span className="min-w-0 flex-1 text-sm text-muted">{t.description}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {g.unreachable.length > 0 && <p className="mt-3 text-sm text-warn">Currently unreachable: {g.unreachable.map((u) => u.server).join(", ")}. Their tools will return when they recover.</p>}
    </>
  );
}
