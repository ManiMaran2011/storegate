import { createLogger, createMcpHttpServer, listen } from "@storegate/mcp-kit";
import { TicketStore } from "./store.js";
import { registerTicketTools } from "./tools.js";

const log = createLogger("tickets-mcp");
const token = process.env.MCP_AUTH_TOKEN;
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

try {
  if (!token) throw new Error("Missing required environment variable MCP_AUTH_TOKEN");
  // One store per process; the HTTP layer is stateless so tool handlers share it.
  const store = new TicketStore();
  const server = createMcpHttpServer({
    name: "tickets-mcp",
    version: "1.0.0",
    instructions: "Support ticket tracker. Tickets can reference WooCommerce order IDs.",
    authToken: token,
    logger: log,
    registerTools: (s) => registerTicketTools(s, store),
  });
  await listen(server, port, log);
} catch (err) {
  log.fatal({ err: (err as Error).message }, "failed to start");
  process.exit(1);
}
