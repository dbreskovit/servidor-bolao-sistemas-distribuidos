import fs from "fs";
import os from "os";
import type { SocketStream } from "@fastify/websocket";

type WebSocket = SocketStream["socket"];

export interface RequestEntry {
  time: string;
  ip: string;
  client: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

interface RecentClient {
  ip: string;
  client: string;
  lastSeen: number;
}

const RECENT_CLIENT_TTL = 5 * 60 * 1000; // 5 min

export interface ResourceSample {
  time: string;
  cpu: number;      // % de um core usado pelo processo
  rss: number;      // bytes
  heapUsed: number; // bytes
  memUsed: number;  // bytes usados no container (cgroup) ou no host
  memLimit: number; // limite do container (cgroup) ou total do host
}

const RESOURCE_INTERVAL_MS = 5000;
const RESOURCE_HISTORY_MAX = 120; // ~10 min

const resourceHistory: ResourceSample[] = [];

function readCgroupNum(p: string): number | null {
  try {
    const s = fs.readFileSync(p, "utf8").trim();
    if (s === "max") return null;
    const n = Number(s);
    // cgroup v1 usa um número gigante para "sem limite"
    return Number.isFinite(n) && n < 2 ** 60 ? n : null;
  } catch {
    return null;
  }
}

function containerMemory(): { used: number; limit: number } {
  const v2 = readCgroupNum("/sys/fs/cgroup/memory.current");
  if (v2 !== null) {
    return { used: v2, limit: readCgroupNum("/sys/fs/cgroup/memory.max") ?? os.totalmem() };
  }
  const v1 = readCgroupNum("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  if (v1 !== null) {
    return { used: v1, limit: readCgroupNum("/sys/fs/cgroup/memory/memory.limit_in_bytes") ?? os.totalmem() };
  }
  return { used: os.totalmem() - os.freemem(), limit: os.totalmem() };
}

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

function sampleResources(): void {
  const now = Date.now();
  const cpu = process.cpuUsage();
  const elapsedUs = (now - lastCpuAt) * 1000;
  const usedUs = cpu.user + cpu.system - lastCpu.user - lastCpu.system;
  const cpuPct = elapsedUs > 0 ? Math.max(0, (usedUs / elapsedUs) * 100) : 0;
  lastCpu = cpu;
  lastCpuAt = now;

  const mem = process.memoryUsage();
  const cont = containerMemory();

  resourceHistory.push({
    time: new Date(now).toISOString(),
    cpu: Math.round(cpuPct * 10) / 10,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    memUsed: cont.used,
    memLimit: cont.limit,
  });
  if (resourceHistory.length > RESOURCE_HISTORY_MAX) resourceHistory.shift();

  broadcastSnapshot();
}

export function startResourceSampler(): void {
  sampleResources();
  const timer = setInterval(sampleResources, RESOURCE_INTERVAL_MS);
  timer.unref();
}

export const stats = {
  startedAt: new Date().toISOString(),
  port: parseInt(process.env.PORT ?? "8080", 10),
  totalRequests: 0,
  byRoute: {} as Record<string, number>,
  byStatus: {} as Record<string, number>,
  recentRequests: [] as RequestEntry[],
};

const recentClients = new Map<string, RecentClient>();
const wsClients = new Set<WebSocket>();

export function registerRequest(entry: RequestEntry): void {
  stats.totalRequests++;
  const key = `${entry.method} ${entry.path}`;
  stats.byRoute[key] = (stats.byRoute[key] ?? 0) + 1;
  const statusKey = String(entry.status);
  stats.byStatus[statusKey] = (stats.byStatus[statusKey] ?? 0) + 1;

  stats.recentRequests.unshift(entry);
  if (stats.recentRequests.length > 50) stats.recentRequests.pop();

  const clientKey = `${entry.ip}|${entry.client}`;
  recentClients.set(clientKey, { ip: entry.ip, client: entry.client, lastSeen: Date.now() });

  broadcastUpdate(entry);
}

export function resetStats(): void {
  stats.totalRequests = 0;
  stats.byRoute = {};
  stats.byStatus = {};
  stats.recentRequests = [];
  recentClients.clear();
  broadcastSnapshot();
}

export function getRecentClients(): RecentClient[] {
  const cutoff = Date.now() - RECENT_CLIENT_TTL;
  for (const [k, v] of recentClients) {
    if (v.lastSeen < cutoff) recentClients.delete(k);
  }
  return Array.from(recentClients.values());
}

export function getSnapshot() {
  return {
    startedAt: stats.startedAt,
    port: stats.port,
    totalRequests: stats.totalRequests,
    byRoute: stats.byRoute,
    byStatus: stats.byStatus,
    recentRequests: stats.recentRequests,
    recentClients: getRecentClients(),
    resources: resourceHistory,
    cores: os.cpus().length,
  };
}

export function addWsClient(ws: WebSocket): void {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: "snapshot", snapshot: getSnapshot() }));
}

function broadcastUpdate(entry: RequestEntry): void {
  const msg = JSON.stringify({ type: "request", data: entry, snapshot: getSnapshot() });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

function broadcastSnapshot(): void {
  const msg = JSON.stringify({ type: "snapshot", data: getSnapshot() });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}
