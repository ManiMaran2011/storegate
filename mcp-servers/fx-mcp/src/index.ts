import { createLogger, createMcpHttpServer, listen } from "@storegate/mcp-kit";
import { registerFxTools } from "./tools.js";

const log = createLogger("fx-mcp");
const token = process.env.MCP_AUTH_TOKEN;
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

try {
  if (!token) throw new Error("Missing required environment variable MCP_AUTH_TOKEN");
  const server = createMcpHttpServer({
    name: "fx-mcp",
    version: "1.0.0",
    instructions: "Currency conversion over a sample FX table (indicative USD-based rates).",
    authToken: token,
    logger: log,
    registerTools: registerFxTools,
  });
  await listen(server, port, log);
} catch (err) {
  log.fatal({ err: (err as Error).message }, "failed to start");
  process.exit(1);
}
