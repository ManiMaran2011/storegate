#!/usr/bin/env node
/**
 * Renders charts/storegate for every values profile and lints the result against the conventions this repo promises:
 * probes, resource requests/limits, hardened security contexts, Secret/Service/Ingress/PVC wiring, default-deny
 * NetworkPolicies, and a matching woo-mcp token in both namespaces.
 *
 * Needs Go (stdlib only) for the template pass. It is a stand-in for `helm template` + `helm lint` where Helm is not
 * installed; run the real tools too (`make chart-lint`).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseAllDocuments } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chart = path.join(root, "charts/storegate");
const profiles = { defaults: [], local: ["values-local.yaml"], "local+nginx": ["values-local.yaml", "values-nginx.yaml"], prod: ["values-prod.yaml"] };

const merge = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b;
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) out[k] = k in out && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v;
  return out;
};

let failures = 0;
const fail = (profile, msg) => {
  failures++;
  console.error(`  ✗ [${profile}] ${msg}`);
};

function render(profile, files, extra = {}) {
  let values = parse(readFileSync(path.join(chart, "values.yaml"), "utf8"));
  for (const f of files) values = merge(values, parse(readFileSync(path.join(chart, f), "utf8")));
  values = merge(values, extra);
  const dir = mkdtempSync(path.join(tmpdir(), "chart-"));
  const vfile = path.join(dir, "values.json");
  writeFileSync(vfile, JSON.stringify(values));
  const r = spawnSync("go", ["run", ".", "-chart", chart, "-values", vfile], { cwd: path.join(root, "scripts/chart-render"), encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    fail(profile, "template rendering failed");
    return undefined;
  }
  return r.stdout;
}

function lint(profile, text) {
  if (text.includes("<no value>")) fail(profile, "a template referenced a missing value (<no value>)");
  const docs = [];
  for (const d of parseAllDocuments(text)) {
    if (d.errors.length) fail(profile, `invalid YAML: ${d.errors[0].message}`);
    const obj = d.toJS();
    if (obj) docs.push(obj);
  }
  const key = (d) => `${d.kind}/${d.metadata?.namespace ?? ""}/${d.metadata?.name}`;
  const byKind = (k) => docs.filter((d) => d.kind === k);
  const exists = (kind, ns, name) => docs.some((d) => d.kind === kind && d.metadata?.name === name && (d.metadata?.namespace ?? "") === ns);
  const cluster = new Set(["Namespace"]);

  for (const d of docs) {
    if (!d.apiVersion || !d.kind || !d.metadata?.name) fail(profile, `document without apiVersion/kind/name: ${JSON.stringify(d).slice(0, 80)}`);
    if (!cluster.has(d.kind) && !d.metadata?.namespace) fail(profile, `${key(d)} has no namespace`);
  }
  const seen = new Set();
  for (const d of docs) {
    const k = key(d);
    if (seen.has(k)) fail(profile, `duplicate resource ${k}`);
    seen.add(k);
  }

  // ---- workloads ----
  const workloads = docs.filter((d) => ["Deployment", "StatefulSet", "Job"].includes(d.kind));
  for (const w of workloads) {
    const ns = w.metadata.namespace;
    const spec = w.spec.template.spec;
    const label = key(w);
    if (spec.automountServiceAccountToken !== false) fail(profile, `${label}: service account token is auto-mounted`);
    const volumes = new Map((spec.volumes ?? []).map((v) => [v.name, v]));
    for (const v of volumes.values()) {
      if (v.persistentVolumeClaim && !exists("PersistentVolumeClaim", ns, v.persistentVolumeClaim.claimName)) fail(profile, `${label}: PVC ${v.persistentVolumeClaim.claimName} is not defined`);
      if (v.configMap && !exists("ConfigMap", ns, v.configMap.name)) fail(profile, `${label}: ConfigMap ${v.configMap.name} is not defined`);
    }
    if (w.kind === "StatefulSet") for (const t of w.spec.volumeClaimTemplates ?? []) volumes.set(t.metadata.name, t);
    for (const c of spec.containers) {
      const where = `${label}/${c.name}`;
      if (!c.image || c.image.endsWith(":latest") || !c.image.includes(":")) fail(profile, `${where}: image must have an explicit non-latest tag (${c.image})`);
      if (!c.resources?.requests?.cpu || !c.resources?.requests?.memory || !c.resources?.limits?.memory) fail(profile, `${where}: needs resource requests and a memory limit`);
      const sc = c.securityContext ?? {};
      if (sc.allowPrivilegeEscalation !== false) fail(profile, `${where}: allowPrivilegeEscalation must be false`);
      if (!sc.capabilities?.drop?.includes("ALL")) fail(profile, `${where}: must drop ALL capabilities`);
      if (w.kind !== "Job") {
        if (!c.readinessProbe) fail(profile, `${where}: no readinessProbe`);
        if (!c.livenessProbe) fail(profile, `${where}: no livenessProbe`);
      }
      const portNames = new Set((c.ports ?? []).map((p) => p.name));
      for (const p of [c.startupProbe, c.livenessProbe, c.readinessProbe]) {
        const port = p?.httpGet?.port ?? p?.tcpSocket?.port;
        if (typeof port === "string" && !portNames.has(port)) fail(profile, `${where}: probe uses undefined port name "${port}"`);
      }
      for (const m of c.volumeMounts ?? []) if (!volumes.has(m.name)) fail(profile, `${where}: mounts undefined volume ${m.name}`);
      for (const e of c.env ?? []) {
        const ref = e.valueFrom?.secretKeyRef;
        if (!ref) continue;
        const secret = docs.find((d) => d.kind === "Secret" && d.metadata.name === ref.name && d.metadata.namespace === ns);
        if (!secret) fail(profile, `${where}: env ${e.name} references missing Secret ${ref.name} in ${ns}`);
        else if (!(ref.key in (secret.stringData ?? secret.data ?? {}))) fail(profile, `${where}: Secret ${ref.name} has no key ${ref.key}`);
      }
      // Anything that looks like a credential must come from a Secret, never a literal.
      for (const e of c.env ?? []) if (e.value && /(PASSWORD|TOKEN|SECRET|KEY)$/.test(e.name) && !e.valueFrom && !/^(PORT|NODE_ENV)$/.test(e.name)) fail(profile, `${where}: ${e.name} is a literal; credentials must come from a Secret`);
    }
    const ps = spec.securityContext ?? {};
    if (!ps.seccompProfile) fail(profile, `${label}: no pod seccompProfile`);
  }

  // ---- services must select something ----
  const podLabels = workloads.map((w) => ({ ns: w.metadata.namespace, labels: w.spec.template.metadata.labels ?? {}, ports: w.spec.template.spec.containers.flatMap((c) => c.ports ?? []) }));
  for (const s of byKind("Service")) {
    const match = podLabels.find((p) => p.ns === s.metadata.namespace && Object.entries(s.spec.selector).every(([k, v]) => p.labels[k] === v));
    if (!match) fail(profile, `${key(s)} selects no workload`);
    else for (const port of s.spec.ports) if (typeof port.targetPort === "string" && !match.ports.some((p) => p.name === port.targetPort)) fail(profile, `${key(s)}: targetPort ${port.targetPort} not exposed by the pods`);
  }
  // ---- ingress backends ----
  for (const i of byKind("Ingress"))
    for (const rule of i.spec.rules) for (const p of rule.http.paths) if (!exists("Service", i.metadata.namespace, p.backend.service.name)) fail(profile, `${key(i)} routes to missing Service ${p.backend.service.name}`);

  // ---- network isolation ----
  for (const ns of new Set(workloads.map((w) => w.metadata.namespace))) {
    const policies = byKind("NetworkPolicy").filter((n) => n.metadata.namespace === ns);
    const deny = policies.find((n) => Object.keys(n.spec.podSelector ?? {}).length === 0 && n.spec.policyTypes?.includes("Ingress") && n.spec.policyTypes?.includes("Egress") && !n.spec.ingress && !n.spec.egress);
    if (!deny) fail(profile, `namespace ${ns} has no default-deny NetworkPolicy`);
  }
  const wooPolicy = byKind("NetworkPolicy").find((n) => n.metadata.name === "woo-mcp");
  const from = wooPolicy?.spec.ingress?.flatMap((r) => r.from ?? []) ?? [];
  if (from.length !== 1 || from[0].podSelector?.matchLabels?.["app.kubernetes.io/name"] !== "gateway") fail(profile, "woo-mcp must accept traffic only from the gateway pods");

  // ---- secrets agree across namespaces ----
  const tokens = byKind("Secret").flatMap((s) => [s.stringData?.token && ["woo-mcp-auth", s.stringData.token], s.stringData?.WOO_MCP_TOKEN && ["upstream-tokens", s.stringData.WOO_MCP_TOKEN]]).filter(Boolean);
  if (new Set(tokens.map((t) => t[1])).size !== 1 || tokens.length !== 2) fail(profile, "the woo-mcp token differs between namespaces");
  const enc = byKind("Secret").find((s) => s.metadata.name === "gateway-secrets")?.stringData?.ENCRYPTION_KEY;
  if (!enc || Buffer.from(enc, "base64").length !== 32) fail(profile, "ENCRYPTION_KEY must decode to 32 bytes");
  for (const s of byKind("Secret")) if (s.metadata.annotations?.["helm.sh/resource-policy"] !== "keep") fail(profile, `${key(s)} should be kept on uninstall`);

  // ---- gateway wiring ----
  const gw = workloads.find((w) => w.metadata.name === "gateway");
  const env = Object.fromEntries((gw?.spec.template.spec.containers[0].env ?? []).map((e) => [e.name, e.value ?? e.valueFrom]));
  try {
    const seeded = JSON.parse(env.SEEDED_UPSTREAMS);
    const allow = String(env.UPSTREAM_PRIVATE_ALLOWLIST).split(",");
    if (seeded.length < 3) fail(profile, "the gateway must seed at least three upstreams");
    for (const s of seeded) {
      const host = new URL(s.url).hostname;
      if (!allow.includes(host)) fail(profile, `seeded upstream ${s.slug} (${host}) is not on the private allowlist`);
      if (s.credentialEnv && !(s.credentialEnv in env)) fail(profile, `seeded upstream ${s.slug} references undefined env ${s.credentialEnv}`);
      const svcNs = host.split(".")[1];
      if (!exists("Service", svcNs, host.split(".")[0])) fail(profile, `seeded upstream ${s.slug} points at missing Service ${host}`);
    }
  } catch (e) {
    fail(profile, `SEEDED_UPSTREAMS is not valid JSON: ${e.message}`);
  }
  if (env.UPSTREAM_ALLOW_LOOPBACK !== undefined) fail(profile, "UPSTREAM_ALLOW_LOOPBACK must never be set in a chart");
  return docs;
}

for (const [name, files] of Object.entries(profiles)) {
  console.log(`rendering [${name}]`);
  const out = render(name, files);
  if (!out) continue;
  const docs = lint(name, out);
  console.log(`  ${docs?.length ?? 0} resources`);
  mkdirSync(path.join(root, ".rendered"), { recursive: true });
  writeFileSync(path.join(root, ".rendered", `${name}.yaml`), out);
}

// A production render must not ship the malicious fixture or anything predictable.
{
  const out = render("prod-checks", profiles.prod);
  if (out) {
    if (/evil-mcp/.test(out.replace(/# Source:.*/g, "")) && /name: evil-mcp/.test(out)) fail("prod", "the evil-mcp fixture must not be deployed in production values");
    if (/storegate-admin-1|shop-admin-local-1/.test(out)) fail("prod", "a local demo password leaked into the production render");
  }
}

if (failures) {
  console.error(`\n${failures} problem(s)`);
  process.exit(1);
}
console.log("\nchart checks passed");
