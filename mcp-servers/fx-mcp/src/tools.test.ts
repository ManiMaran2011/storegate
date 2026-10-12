import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { convert, rate } from "./rates.js";
import { registerFxTools } from "./tools.js";

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "fx", version: "0" });
  registerFxTools(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return client;
}

describe("fx math", () => {
  it("is consistent in both directions", () => {
    expect(rate("USD", "INR")).toBeCloseTo(83.4, 6);
    expect(rate("INR", "USD") * rate("USD", "INR")).toBeCloseTo(1, 10);
  });
  it("rounds to the target currency's precision", () => {
    expect(convert(100, "USD", "JPY").result).toBe(14950);
    expect(convert(100, "USD", "INR").result).toBe(8340);
    expect(convert(1, "INR", "USD").result).toBe(0.01);
  });
});

describe("fx-mcp tools", () => {
  it("converts and returns structured data", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "convert_currency", arguments: { amount: 8340, from: "inr", to: "USD" } });
    expect(res.structuredContent).toMatchObject({ from: "INR", to: "USD", result: 100 });
  });
  it("reports unknown currencies as a tool error", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "get_rate", arguments: { from: "XXX", to: "USD" } });
    expect(res.isError).toBe(true);
  });
  it("exposes a generic 'search' tool (collision fixture)", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("search");
    const res = await client.callTool({ name: "search", arguments: { query: "rupee" } });
    expect(res.structuredContent).toEqual({ matches: [{ code: "INR", name: "Indian Rupee" }] });
  });
  it("marks every tool read-only", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });
});
