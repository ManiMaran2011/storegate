/**
 * Sample FX table. This is demo data (rates are indicative, USD-based) so the
 * server is deterministic and needs no outbound network access. Swapping in a
 * live provider only means replacing `usdRate`.
 */
export const AS_OF = "2026-10-01";

interface Currency {
  code: string;
  name: string;
  /** How many units of this currency one USD buys. */
  perUsd: number;
  /** Decimal places used when rounding amounts. */
  decimals: number;
}

export const CURRENCIES: readonly Currency[] = [
  { code: "USD", name: "United States Dollar", perUsd: 1, decimals: 2 },
  { code: "EUR", name: "Euro", perUsd: 0.92, decimals: 2 },
  { code: "GBP", name: "British Pound Sterling", perUsd: 0.78, decimals: 2 },
  { code: "INR", name: "Indian Rupee", perUsd: 83.4, decimals: 2 },
  { code: "JPY", name: "Japanese Yen", perUsd: 149.5, decimals: 0 },
  { code: "AUD", name: "Australian Dollar", perUsd: 1.52, decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", perUsd: 1.36, decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", perUsd: 1.34, decimals: 2 },
  { code: "AED", name: "United Arab Emirates Dirham", perUsd: 3.6725, decimals: 2 },
  { code: "CNY", name: "Chinese Yuan Renminbi", perUsd: 7.24, decimals: 2 },
  { code: "CHF", name: "Swiss Franc", perUsd: 0.88, decimals: 2 },
];

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export class UnknownCurrencyError extends Error {
  constructor(code: string) {
    super(`Unknown currency "${code}". Use list_currencies to see supported codes.`);
  }
}

export function currency(code: string): Currency {
  const found = byCode.get(code.toUpperCase());
  if (!found) throw new UnknownCurrencyError(code);
  return found;
}

export function rate(from: string, to: string): number {
  return currency(to).perUsd / currency(from).perUsd;
}

export function convert(amount: number, from: string, to: string): { rate: number; result: number } {
  const r = rate(from, to);
  const decimals = currency(to).decimals;
  const factor = 10 ** decimals;
  return { rate: r, result: Math.round(amount * r * factor) / factor };
}

export function searchCurrencies(query: string): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
}
