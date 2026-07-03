import { FastifyInstance } from "fastify";
import { adminLogin, validateAdminToken } from "../auth.js";
import { resetAll } from "../db.js";
import { clearLogs } from "../logger.js";
import { resetStats } from "../monitor.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { password: string } }>("/api/admin/login", {
    schema: {
      tags: ["admin"],
      summary: "Login do painel admin — retorna token de sessão",
      body: {
        type: "object",
        required: ["password"],
        properties: { password: { type: "string" } },
      },
      response: {
        200: { type: "object", properties: { token: { type: "string" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const token = adminLogin(req.body.password);
    if (!token) return reply.code(401).send({ error: "invalid password" });
    return reply.send({ token });
  });

  app.post("/api/admin/reset", {
    schema: {
      tags: ["admin"],
      summary: "Apaga todas as partidas, palpites e logs (jogadores cadastrados são mantidos com 0 pontos)",
      security: [{ adminToken: [] }],
      response: {
        200: { type: "object", properties: { ok: { type: "boolean" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!validateAdminToken(token)) return reply.code(401).send({ error: "unauthorized" });

    await resetAll();
    clearLogs();
    resetStats();

    return reply.send({ ok: true });
  });
}
