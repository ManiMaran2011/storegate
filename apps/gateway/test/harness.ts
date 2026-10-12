import { randomBytes, randomUUID } from "node:crypto";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHttpServer } from "@storegate/mcp-kit";
import { registerEvilTools } from "@storegate/evil-mcp/tools";
import { registerFxTools } from "@storegate/fx-mcp/tools";
import { TicketStore } from "@storegate/tickets-mcp/store";
import { registerTicketTools } from "@storegate/tickets-mcp/tools";
import { WooClient } from "@storegate/woo-mcp/client";
import { MOCK_KEY, MOCK_SECRET, startMockWoo, type MockWoo } from "@storegate/woo-mcp/testing";
import { registerWooTools } from "@storegate/woo-mcp/tools";
import { pino } from "pino";
import pg from "pg";
import type { Principal, Role } from "../src/auth/principal.js";
import { loadConfig, type Config } from "../src/config.js";
import { createContainer, type Container } from "../src/container.js";
import { createPool, type Db } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";

export const TEST_PG = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
export const silent = pino({ level: "silent" });

export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `storegate_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_PG });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = TEST_PG.replace(/\/[^/]*$/, `/${name}`);
  return {
    url,
    drop: async () => {
      const c = new pg.Client({ connectionString: TEST_PG });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}

export function testConfig(databaseUrl: string, overrides: Record<string, string> = {}): Config {
  return loadConfig({
    DATABASE_URL: databaseUrl,
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    UPSTREAM_ALLOW_LOOPBACK: "true",
    UPSTREAM_CONNECT_TIMEOUT_MS: "1500",
    UPSTREAM_LIST_TIMEOUT_MS: "1500",
    UPSTREAM_CALL_TIMEOUT_MS: "2000",
    CATALOG_TTL_MS: "0",
    HEALTH_INTERVAL_MS: "0",
    BREAKER_FAILURES: "3",
    BREAKER_COOLDOWN_MS: "400",
    RATE_LIMIT_PER_MINUTE: "1000",
    ...overrides,
  });
}

export interface TestUpstream {
  url: string;
  mcpUrl: string;
  token: string;
  server: http.Server;
  close: () => Promise<void>;
  /** Stop listening without destroying the object, to simulate a killed pod. */
  kill: () => Promise<void>;
  port: number;
}

export async function startUpstream(name: string, register: (s: McpServer) => void, opts: { token?: string; port?: number } = {}): Promise<TestUpstream> {
  const token = opts.token ?? `tok-${name}-${randomBytes(6).toString("hex")}`;
  const server = createMcpHttpServer({ name, version: "test", authToken: token, logger: silent, registerTools: register });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const kill = () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  return { url: `http://127.0.0.1:${port}`, mcpUrl: `http://127.0.0.1:${port}/mcp`, token, server, port, close: kill, kill };
}

export const startFx = () => startUpstream("fx", registerFxTools);
export const startTickets = () => startUpstream("tickets", (s) => registerTicketTools(s, new TicketStore()));
export const startEvil = (rugPullAfterSeconds = 0) => startUpstream("evil", (s) => registerEvilTools(s, { rugPullAfterSeconds, startedAt: Date.now() }));
export async function startWoo(): Promise<{ upstream: TestUpstream; woo: MockWoo }> {
  const woo = await startMockWoo();
  const client = new WooClient({ baseUrl: woo.url, consumerKey: MOCK_KEY, consumerSecret: MOCK_SECRET, timeoutMs: 1000 });
  const upstream = await startUpstream("woo", (s) => registerWooTools(s, client, { timezone: "UTC", storeName: "test-store" }, silent));
  return { upstream, woo };
}

export interface TestEnv {
  c: Container;
  db: Db;
  makeUser: (role: Role, email?: string) => Promise<Principal>;
  addUpstream: (up: TestUpstream, slug: string, opts?: { trust?: boolean; credential?: string | null }) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function createEnv(overrides: Record<string, string> = {}): Promise<TestEnv> {
  const database = await createTestDatabase();
  const db = createPool(database.url, 5);
  await migrate(db, silent);
  const config = testConfig(database.url, overrides);
  const c = createContainer(config, silent, db);

  return {
    c,
    db,
    makeUser: async (role, email = `${role}-${randomUUID().slice(0, 8)}@example.com`) => {
      const { rows } = await db.query<{ id: string }>("INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, 'x') RETURNING id", [email, email.split("@")[0], role]);
      return { userId: rows[0]!.id, email, name: email.split("@")[0]!, role, via: "api_key", keyPrefix: "test" };
    },
    addUpstream: async (up, slug, opts = {}) => {
      const record = await c.admin.create({
        slug,
        name: slug.toUpperCase(),
        url: up.mcpUrl,
        authType: "bearer",
        credential: opts.credential === undefined ? up.token : opts.credential,
        trustAnnotations: opts.trust ?? true,
      });
      return record.id;
    },
    cleanup: async () => {
      c.health.stop();
      await c.pool.close();
      await db.end();
      await database.drop();
    },
  };
}

/** Pulls the text payload out of a tool result. */
export function textOf(result: { content?: unknown }): string {
  const block = (result.content as { type: string; text?: string }[] | undefined)?.find((b) => b.type === "text");
  return block?.text ?? "";
}
