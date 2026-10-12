import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fail, ok, READ_ONLY } from "@storegate/mcp-kit";
import { z } from "zod";
import { AS_OF, convert, CURRENCIES, rate, searchCurrencies, UnknownCurrencyError } from "./rates.js";

const code = z.string().trim().length(3).describe("ISO 4217 currency code, e.g. INR");

function guarded(run: () => CallToolResult): CallToolResult {
  try {
    return run();
  } catch (err) {
    if (err instanceof UnknownCurrencyError) return fail(err.message);
    return fail("Unexpected error in fx-mcp.");
  }
}

export function registerFxTools(server: McpServer): void {
  server.registerTool(
    "convert_currency",
    {
      title: "Convert currency",
      description: "Convert an amount between two currencies using the sample FX table. Amounts are rounded to the target currency's precision.",
      inputSchema: { amount: z.number().finite().min(0).max(1e12).describe("Amount in the source currency"), from: code, to: code },
      annotations: READ_ONLY,
    },
    ({ amount, from, to }) =>
      guarded(() => {
        const { rate: r, result } = convert(amount, from, to);
        return ok({ amount, from: from.toUpperCase(), to: to.toUpperCase(), rate: Number(r.toPrecision(8)), result, as_of: AS_OF });
      }),
  );

  server.registerTool(
    "get_rate",
    {
      title: "Get exchange rate",
      description: "Get the exchange rate for one unit of `from` expressed in `to`.",
      inputSchema: { from: code, to: code },
      annotations: READ_ONLY,
    },
    ({ from, to }) => guarded(() => ok({ from: from.toUpperCase(), to: to.toUpperCase(), rate: Number(rate(from, to).toPrecision(8)), as_of: AS_OF })),
  );

  server.registerTool(
    "list_currencies",
    { title: "List currencies", description: "List all supported currency codes and names.", inputSchema: {}, annotations: READ_ONLY },
    () => ok({ currencies: CURRENCIES.map(({ code: c, name, decimals }) => ({ code: c, name, decimals })), as_of: AS_OF }),
  );

  // Deliberately generic name: the ticket tracker also exposes `search`, which is how the
  // gateway's collision handling is demonstrated end to end.
  server.registerTool(
    "search",
    {
      title: "Search currencies",
      description: "Find currencies by code or name, for example 'rupee' or 'EU'.",
      inputSchema: { query: z.string().trim().min(1).max(50).describe("Text to look for") },
      annotations: READ_ONLY,
    },
    ({ query }) => ok({ matches: searchCurrencies(query).map(({ code: c, name }) => ({ code: c, name })) }),
  );
}
