import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { TicketStore } from "./store.js";
import { registerTicketTools } from "./tools.js";

async function connect(store = new TicketStore()): Promise<Client> {
  const server = new McpServer({ name: "tickets", version: "0" });
  registerTicketTools(server, store);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return client;
}

const data = (r: { structuredContent?: unknown }) => r.structuredContent as any;

describe("tickets-mcp", () => {
  it("starts with seeded tickets and filters by status and order", async () => {
    const client = await connect();
    expect(data(await client.callTool({ name: "list_tickets", arguments: {} })).tickets).toHaveLength(3);
    expect(data(await client.callTool({ name: "list_tickets", arguments: { status: "closed" } })).tickets).toHaveLength(1);
    expect(data(await client.callTool({ name: "list_tickets", arguments: { order_id: 1 } })).tickets[0].title).toMatch(/parcel/);
  });

  it("creates, comments on and updates a ticket", async () => {
    const client = await connect();
    const created = data(await client.callTool({ name: "create_ticket", arguments: { title: "Refund request", body: "Order arrived damaged", priority: "urgent", order_id: 42 } }));
    const id = created.ticket.id as number;
    expect(created.ticket).toMatchObject({ status: "open", priority: "urgent", order_id: 42 });
    await client.callTool({ name: "add_comment", arguments: { id, body: "Contacted courier" } });
    await client.callTool({ name: "update_ticket_status", arguments: { id, status: "resolved" } });
    const full = data(await client.callTool({ name: "get_ticket", arguments: { id } }));
    expect(full.ticket.status).toBe("resolved");
    expect(full.ticket.comments).toHaveLength(1);
  });

  it("returns tool errors for unknown tickets and bad input", async () => {
    const client = await connect();
    expect((await client.callTool({ name: "get_ticket", arguments: { id: 999 } })).isError).toBe(true);
    const bad = await client.callTool({ name: "create_ticket", arguments: { title: "x", body: "" } }).catch(() => ({ isError: true }));
    expect(bad.isError).toBe(true);
  });

  it("searches titles and bodies", async () => {
    const client = await connect();
    expect(data(await client.callTool({ name: "search", arguments: { query: "parcel" } })).tickets).toHaveLength(1);
  });

  it("annotates reads as read-only and writes as not", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const ro = Object.fromEntries(tools.map((t) => [t.name, t.annotations?.readOnlyHint]));
    expect(ro).toMatchObject({ list_tickets: true, get_ticket: true, search: true, create_ticket: false, add_comment: false, update_ticket_status: false });
  });

  it("enforces a ticket cap so memory cannot grow without bound", () => {
    const store = new TicketStore();
    expect(() => {
      for (let i = 0; i < 2000; i++) store.create({ title: "t", body: "b", priority: "low", order_id: null });
    }).toThrow(/limit/i);
  });
});
