import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";
import { validateAdminToken } from "../auth.js";
import { addWsClient } from "../monitor.js";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", {
    schema: {
      tags: ["system"],
      summary: "Healthcheck",
      response: { 200: { type: "object", properties: { status: { type: "string" } } } },
    },
  }, async (_req, reply) => reply.send({ status: "ok" }));

  app.get("/dashboard", async (_req, reply) => {
    return reply.send({ message: "dashboard works" });
  });

  app.get("/test", async (_req, reply) => {
    return reply.send({ test: "ok", cwd: process.cwd() });
  });

  // WebSocket — protegido por ?token=
  app.get("/ws", { websocket: true }, (connection, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") ?? undefined;

    if (!validateAdminToken(token)) {
      connection.socket.close(1008, "Unauthorized");
      return;
    }

    addWsClient(connection.socket);
  });
}
