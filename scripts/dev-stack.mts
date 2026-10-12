/**
 * Local development stack without Kubernetes: starts the sample upstreams (a mock WooCommerce,
 * fx, tickets and the deliberately malicious evil-mcp) on loopback, then the gateway.
 *   DATABASE_URL=postgres://... npx tsx scripts/dev-stack.mts
 * Sign in with admin@example.com / admin-password-123.
 */
import { createMcpHttpServer } from "@storegate/mcp-kit";
import { registerEvilTools } from "@storegate/evil-mcp/tools";
import { registerFxTools } from "@storegate/fx-mcp/tools";
import { TicketStore } from "@storegate/tickets-mcp/store";
import { registerTicketTools } from "@storegate/tickets-mcp/tools";
import { WooClient } from "@storegate/woo-mcp/client";
import { MOCK_KEY, MOCK_SECRET, startMockWoo } from "@storegate/woo-mcp/testing";
import { registerWooTools } from "@storegate/woo-mcp/tools";
import { randomBytes } from "node:crypto";
import { pino } from "pino";

const log = pino({ level: "warn" });
const token = "dev-upstream-token";
const start = (name: string, port: number, register: Parameters<typeof createMcpHttpServer>[0]["registerTools"]) =>
  new Promise<void>((r) => createMcpHttpServer({ name, version: "dev", authToken: token, logger: log, registerTools: register }).listen(port, "127.0.0.1", r));

const woo = await startMockWoo();
const client = new WooClient({ baseUrl: woo.url, consumerKey: MOCK_KEY, consumerSecret: MOCK_SECRET, timeoutMs: 3000 });
await start("woo", 9101, (s) => registerWooTools(s, client, { timezone: "Asia/Kolkata", storeName: "Dev Store" }, log));
await start("fx", 9102, registerFxTools);
await start("tickets", 9103, (s) => registerTicketTools(s, new TicketStore()));
await start("evil", 9104, (s) => registerEvilTools(s, { rugPullAfterSeconds: 0, startedAt: Date.now() }));

const up = (slug: string, name: string, port: number, trust: boolean) => ({ slug, name, url: `http://127.0.0.1:${port}/mcp`, credentialEnv: "DEV_UPSTREAM_TOKEN", trustAnnotations: trust, enabled: true });
Object.assign(process.env, {
  PORT: "8080",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/storegate_dev",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? randomBytes(32).toString("base64"),
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
  BOOTSTRAP_ADMIN_PASSWORD: "admin-password-123",
  UPSTREAM_ALLOW_LOOPBACK: "true",
  COOKIE_SECURE: "false",
  PUBLIC_URL: "http://localhost:5173",
  DEV_UPSTREAM_TOKEN: token,
  LOG_LEVEL: "info",
  SEEDED_UPSTREAMS: JSON.stringify([up("woo", "WooCommerce store", 9101, true), up("fx", "Currency rates", 9102, true), up("tickets", "Support tickets", 9103, true)].concat([]) /* evil-mcp is on :9104; add it from the dashboard to see quarantine in action */),
});
await import("../apps/gateway/src/main.js");
