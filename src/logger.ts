import fs from "fs";
import path from "path";
import { FastifyRequest, FastifyReply } from "fastify";
import { registerRequest } from "./monitor.js";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "requests.log");

export function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function clearLogs(): void {
  try {
    fs.writeFileSync(LOG_FILE, "");
  } catch {
    // ignore log clear errors
  }
}

export function getClientInfo(request: FastifyRequest): { ip: string; client: string } {
  const ip = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? request.ip;
  const client = (request.headers["x-client-id"] as string) ?? "unknown";
  return { ip, client };
}

export function logRequest(request: FastifyRequest, reply: FastifyReply, responseTime: number): void {
  const time = new Date().toISOString();
  const { ip, client } = getClientInfo(request);
  const method = request.method;
  const urlPath = request.url.split("?")[0];
  const status = reply.statusCode;
  const ms = Math.round(responseTime);

  const line = `${time} | ip=${ip} | client=${client} | ${method} ${urlPath} | ${status} | ${ms}ms\n`;

  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore log write errors
  }

  registerRequest({ time, ip, client, method, path: urlPath, status, ms });
}
