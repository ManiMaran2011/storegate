import type { Logger } from "pino";
import { AuditService } from "./audit/audit.js";
import { AuthService } from "./auth/service.js";
import type { Config } from "./config.js";
import { SecretBox } from "./crypto.js";
import type { Db } from "./db/pool.js";
import { GatewayService } from "./mcp/gateway-service.js";
import { Metrics } from "./metrics.js";
import { PolicyStore } from "./policy/engine.js";
import { UpstreamAdmin } from "./upstreams/admin.js";
import { ToolCatalog } from "./upstreams/catalog.js";
import { HealthMonitor } from "./upstreams/health.js";
import { PinStore } from "./upstreams/pins.js";
import { UpstreamPool } from "./upstreams/pool.js";
import { UpstreamRegistry } from "./upstreams/registry.js";
import { RateLimiter } from "./util/rate-limiter.js";

/** Composition root: constructs every service once and wires their dependencies. */
export interface Container {
  config: Config;
  log: Logger;
  db: Db;
  box: SecretBox;
  metrics: Metrics;
  auth: AuthService;
  registry: UpstreamRegistry;
  pool: UpstreamPool;
  pins: PinStore;
  catalog: ToolCatalog;
  health: HealthMonitor;
  admin: UpstreamAdmin;
  policy: PolicyStore;
  audit: AuditService;
  limiter: RateLimiter;
  loginLimiter: RateLimiter;
  gateway: GatewayService;
}

export function createContainer(config: Config, log: Logger, db: Db): Container {
  const box = new SecretBox(config.encryptionKey, config.encryptionKeyPrevious);
  const metrics = new Metrics();
  const ssrf = { privateAllowlist: config.upstream.privateAllowlist, allowLoopback: config.upstream.allowLoopback };

  const auth = new AuthService(db, log, config.sessionTtlMs);
  const registry = new UpstreamRegistry(db, box, log);
  const pool = new UpstreamPool(
    {
      connectTimeoutMs: config.upstream.connectTimeoutMs,
      listTimeoutMs: config.upstream.listTimeoutMs,
      callTimeoutMs: config.upstream.callTimeoutMs,
      breakerFailures: config.upstream.breakerFailures,
      breakerCooldownMs: config.upstream.breakerCooldownMs,
      ssrf,
    },
    log,
  );
  const pins = new PinStore(db);
  const catalog = new ToolCatalog(
    registry,
    pool,
    pins,
    { ttlMs: config.upstream.catalogTtlMs, staleGraceMs: config.upstream.catalogStaleGraceMs },
    metrics,
    log,
  );
  const health = new HealthMonitor(registry, catalog, config.upstream.healthIntervalMs, log);
  const admin = new UpstreamAdmin(registry, catalog, pool, health, ssrf);
  const policy = new PolicyStore(db);
  const audit = new AuditService(db);
  const limiter = new RateLimiter(config.rateLimitPerMinute, 60_000);
  const loginLimiter = new RateLimiter(8, 5 * 60_000);
  const gateway = new GatewayService(registry, catalog, pool, policy, audit, limiter, metrics, { maxResultBytes: config.upstream.maxResultBytes }, log);

  return { config, log, db, box, metrics, auth, registry, pool, pins, catalog, health, admin, policy, audit, limiter, loginLimiter, gateway };
}
