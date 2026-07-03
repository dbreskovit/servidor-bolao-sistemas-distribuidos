// SQLite's datetime('now') has no timezone suffix but is always UTC;
// Postgres already returns a proper ISO string.
export function parseServerTime(s: string): Date {
  return new Date(!s.includes("T") ? s.replace(" ", "T") + "Z" : s);
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function fmtBytes(n: number): string {
  if (n >= GB) return (n / GB).toFixed(2) + " GB";
  if (n >= MB) return (n / MB).toFixed(1) + " MB";
  if (n >= KB) return (n / KB).toFixed(0) + " KB";
  return n + " B";
}

export function fmtUptime(startedAt: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR");

export const fmtDateTime = (d: Date) => d.toLocaleString("pt-BR");
