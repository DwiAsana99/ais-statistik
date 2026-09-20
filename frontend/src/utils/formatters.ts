export function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

export function formatDecimal(n: number, digits = 1): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function truncate(s: string | null | undefined, max = 25): string {
  if (!s) return "-";
  return s.length > max ? s.slice(0, max) + "…" : s;
}
