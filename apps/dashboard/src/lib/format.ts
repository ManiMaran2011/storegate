const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 45) return "just now";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
export const num = (n: number) => n.toLocaleString();
export const pct = (a: number, b: number) => (b === 0 ? "0%" : `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%`);
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
