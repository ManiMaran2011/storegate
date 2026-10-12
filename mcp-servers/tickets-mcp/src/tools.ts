import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok, READ_ONLY, WRITE } from "@storegate/mcp-kit";
import { z } from "zod";
import { PRIORITIES, TICKET_STATUSES, type Ticket, type TicketStore } from "./store.js";

const summary = (t: Ticket) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  order_id: t.order_id,
  comments: t.comments.length,
  updated_at: t.updated_at,
});

const id = z.number().int().positive().describe("Ticket ID");

export function registerTicketTools(server: McpServer, store: TicketStore): void {
  server.registerTool(
    "list_tickets",
    {
      title: "List tickets",
      description: "List support tickets, newest first. Optionally filter by status or by the WooCommerce order ID a ticket refers to.",
      inputSchema: {
        status: z.enum(TICKET_STATUSES).optional().describe("Only tickets in this status"),
        order_id: z.number().int().positive().optional().describe("Only tickets about this order"),
      },
      annotations: READ_ONLY,
    },
    ({ status, order_id }) => ok({ tickets: store.list({ status, order_id }).map(summary) }),
  );

  server.registerTool(
    "get_ticket",
    { title: "Get ticket", description: "Get one ticket with its full comment thread.", inputSchema: { id }, annotations: READ_ONLY },
    ({ id: ticketId }) => {
      const ticket = store.get(ticketId);
      return ticket ? ok({ ticket }) : fail(`Ticket ${ticketId} not found.`);
    },
  );

  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description: "Open a new support ticket, optionally linked to a WooCommerce order ID.",
      inputSchema: {
        title: z.string().trim().min(3).max(200).describe("Short summary"),
        body: z.string().trim().min(1).max(4000).describe("Details of the issue"),
        priority: z.enum(PRIORITIES).default("normal").describe("Priority"),
        order_id: z.number().int().positive().optional().describe("Related order ID"),
      },
      annotations: WRITE,
    },
    ({ title, body, priority, order_id }) => {
      try {
        return ok({ ticket: summary(store.create({ title, body, priority, order_id: order_id ?? null })) });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description: "Add a comment to an existing ticket.",
      inputSchema: { id, body: z.string().trim().min(1).max(2000).describe("Comment text") },
      annotations: WRITE,
    },
    ({ id: ticketId, body }) => {
      const ticket = store.comment(ticketId, "agent", body);
      return ticket ? ok({ ticket: summary(ticket) }) : fail(`Ticket ${ticketId} not found.`);
    },
  );

  server.registerTool(
    "update_ticket_status",
    {
      title: "Update ticket status",
      description: "Move a ticket to a new status.",
      inputSchema: { id, status: z.enum(TICKET_STATUSES).describe("New status") },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ id: ticketId, status }) => {
      const ticket = store.update(ticketId, { status });
      return ticket ? ok({ ticket: summary(ticket) }) : fail(`Ticket ${ticketId} not found.`);
    },
  );

  // Same name as fx-mcp's `search` on purpose: exercises the gateway's namespacing.
  server.registerTool(
    "search",
    {
      title: "Search tickets",
      description: "Full-text search across ticket titles and descriptions.",
      inputSchema: { query: z.string().trim().min(1).max(100).describe("Text to look for") },
      annotations: READ_ONLY,
    },
    ({ query }) => ok({ tickets: store.search(query).map(summary) }),
  );
}
