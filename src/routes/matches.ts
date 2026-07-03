import { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { validateAdminToken } from "../auth.js";
import { calcPoints } from "../scoring.js";
import { findCountry, countryFlag } from "../countries.js";
import { getClientInfo } from "../logger.js";

const matchSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    team_a: { type: "object", properties: { name: { type: "string" }, flag: { type: "string" } } },
    team_b: { type: "object", properties: { name: { type: "string" }, flag: { type: "string" } } },
    kickoff_at: { type: "string" },
    status: { type: "string" },
    real_score: { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } } },
  },
} as const;

function formatMatch(row: Record<string, unknown>) {
  const m: Record<string, unknown> = {
    id: row.id,
    team_a: { name: row.team_a_name, flag: row.team_a_flag },
    team_b: { name: row.team_b_name, flag: row.team_b_flag },
    kickoff_at: row.kickoff_at,
    status: row.status,
  };
  if (row.status === "finished") {
    m.real_score = { a: row.real_score_a, b: row.real_score_b };
  }
  return m;
}

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/ — partida atual
  app.get("/api/", {
    schema: {
      tags: ["matches"],
      summary: "Partida atual (scheduled ou mais recente finished)",
      response: {
        200: matchSchema,
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (_req, reply) => {
    let { rows } = await db.query(
      "SELECT * FROM matches WHERE status='scheduled' LIMIT 1"
    );
    if (rows.length === 0) {
      const r2 = await db.query(
        "SELECT * FROM matches WHERE status='finished' ORDER BY kickoff_at DESC LIMIT 1"
      );
      rows = r2.rows;
    }
    if (rows.length === 0) return reply.code(404).send({ error: "no matches" });
    return reply.send(formatMatch(rows[0]));
  });

  // GET /api/matches — lista
  app.get("/api/matches", {
    schema: {
      tags: ["matches"],
      summary: "Lista todas as partidas",
      response: {
        200: { type: "array", items: matchSchema },
      },
    },
  }, async (_req, reply) => {
    const { rows } = await db.query("SELECT * FROM matches ORDER BY kickoff_at ASC");
    return reply.send(rows.map(formatMatch));
  });

  // GET /api/matches/:id
  app.get<{ Params: { id: string } }>("/api/matches/:id", {
    schema: {
      tags: ["matches"],
      summary: "Uma partida pelo ID",
      params: { type: "object", properties: { id: { type: "integer" } } },
      response: {
        200: matchSchema,
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const { rows } = await db.query("SELECT * FROM matches WHERE id=$1", [req.params.id]);
    if (rows.length === 0) return reply.code(404).send({ error: "match not found" });
    return reply.send(formatMatch(rows[0]));
  });

  // POST /api/match?id=:id — palpite (público)
  app.post<{ Querystring: { id: string }; Body: { username: string; score_a: number; score_b: number; timestamp?: string } }>(
    "/api/match",
    {
      schema: {
        tags: ["predictions"],
        summary: "Cadastrar/atualizar palpite",
        querystring: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
        body: {
          type: "object",
          required: ["username", "score_a", "score_b"],
          properties: {
            username: { type: "string", minLength: 1 },
            score_a: { type: "integer", minimum: 0 },
            score_b: { type: "integer", minimum: 0 },
            timestamp: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "integer" },
              match_id: { type: "integer" },
              username: { type: "string" },
              score_a: { type: "integer" },
              score_b: { type: "integer" },
              updated_at: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const matchId = req.query.id;
      const { username, score_a, score_b } = req.body;

      if (!username?.trim()) return reply.code(400).send({ error: "username is required" });

      const { rows: mRows } = await db.query("SELECT * FROM matches WHERE id=$1", [matchId]);
      if (mRows.length === 0) return reply.code(404).send({ error: "match not found" });
      if (mRows[0].status === "finished") return reply.code(409).send({ error: "match already finished" });

      const { rows } = await db.query(
        `INSERT INTO predictions (match_id, username, score_a, score_b)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (match_id, username) DO UPDATE
           SET score_a=EXCLUDED.score_a, score_b=EXCLUDED.score_b, updated_at=now()
         RETURNING *`,
        [matchId, username.trim(), score_a, score_b]
      );

      const { ip, client } = getClientInfo(req);
      await db.query(
        `INSERT INTO match_clients (match_id, ip, client, username)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (match_id, ip, client) DO UPDATE
           SET username=EXCLUDED.username, last_seen=now(), request_count=match_clients.request_count + 1`,
        [matchId, ip, client, username.trim()]
      );

      const p = rows[0];
      return reply.send({
        id: p.id,
        match_id: p.match_id,
        username: p.username,
        score_a: p.score_a,
        score_b: p.score_b,
        updated_at: p.updated_at,
      });
    }
  );

  // POST /api/matches — criar partida (admin)
  app.post<{ Body: { team_a: string; team_b: string; kickoff_at?: string } }>(
    "/api/matches",
    {
      schema: {
        tags: ["admin"],
        summary: "Criar nova partida (admin)",
        security: [{ adminToken: [] }],
        body: {
          type: "object",
          required: ["team_a", "team_b"],
          properties: {
            team_a: { type: "string" },
            team_b: { type: "string" },
            kickoff_at: { type: "string" },
          },
        },
        response: {
          201: matchSchema,
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const token = req.headers["x-admin-token"] as string | undefined;
      if (!validateAdminToken(token)) return reply.code(401).send({ error: "unauthorized" });

      const { team_a, team_b, kickoff_at } = req.body;

      if (team_a === team_b) return reply.code(400).send({ error: "team_a and team_b must be different" });

      const countryA = findCountry(team_a);
      const countryB = findCountry(team_b);
      if (!countryA) return reply.code(400).send({ error: "unknown country: " + team_a });
      if (!countryB) return reply.code(400).send({ error: "unknown country: " + team_b });

      const { rows: existing } = await db.query(
        "SELECT id FROM matches WHERE status='scheduled' LIMIT 1"
      );
      if (existing.length > 0) {
        return reply.code(409).send({ error: "active match exists; finish it first" });
      }

      const kickoff = kickoff_at ?? new Date().toISOString();
      const { rows } = await db.query(
        `INSERT INTO matches (team_a_name, team_a_flag, team_b_name, team_b_flag, kickoff_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [countryA.name, countryFlag(countryA), countryB.name, countryFlag(countryB), kickoff]
      );

      return reply.code(201).send(formatMatch(rows[0]));
    }
  );

  // POST /api/matches/:id/result — finalizar partida (admin)
  app.post<{ Params: { id: string }; Body: { score_a: number; score_b: number } }>(
    "/api/matches/:id/result",
    {
      schema: {
        tags: ["admin"],
        summary: "Cadastrar resultado real e calcular pontos (admin)",
        security: [{ adminToken: [] }],
        params: { type: "object", properties: { id: { type: "integer" } } },
        body: {
          type: "object",
          required: ["score_a", "score_b"],
          properties: {
            score_a: { type: "integer", minimum: 0 },
            score_b: { type: "integer", minimum: 0 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              match_id: { type: "integer" },
              status: { type: "string" },
              real_score: { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } } },
              predictions_scored: { type: "integer" },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const token = req.headers["x-admin-token"] as string | undefined;
      if (!validateAdminToken(token)) return reply.code(401).send({ error: "unauthorized" });

      const matchId = req.params.id;
      const { score_a, score_b } = req.body;

      const { rows: mRows } = await db.query("SELECT * FROM matches WHERE id=$1", [matchId]);
      if (mRows.length === 0) return reply.code(404).send({ error: "match not found" });

      await db.query(
        "UPDATE matches SET status='finished', real_score_a=$1, real_score_b=$2 WHERE id=$3",
        [score_a, score_b, matchId]
      );

      const { rows: preds } = await db.query(
        "SELECT * FROM predictions WHERE match_id=$1",
        [matchId]
      );

      for (const p of preds) {
        const pts = calcPoints(p.score_a as number, p.score_b as number, score_a, score_b);
        await db.query("UPDATE predictions SET points=$1 WHERE id=$2", [pts, p.id]);
      }

      return reply.send({
        match_id: parseInt(matchId, 10),
        status: "finished",
        real_score: { a: score_a, b: score_b },
        predictions_scored: preds.length,
      });
    }
  );

  // GET /api/matches/:id/clients — clientes/IPs que enviaram palpite (admin)
  app.get<{ Params: { id: string } }>("/api/matches/:id/clients", {
    schema: {
      tags: ["admin"],
      summary: "Clientes/IPs que enviaram palpite para a partida (admin)",
      security: [{ adminToken: [] }],
      params: { type: "object", properties: { id: { type: "integer" } } },
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ip: { type: "string" },
              client: { type: "string" },
              username: { type: "string" },
              first_seen: { type: "string" },
              last_seen: { type: "string" },
              request_count: { type: "integer" },
            },
          },
        },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (req, reply) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!validateAdminToken(token)) return reply.code(401).send({ error: "unauthorized" });

    const { rows } = await db.query(
      `SELECT ip, client, username, first_seen, last_seen, request_count
       FROM match_clients WHERE match_id=$1 ORDER BY last_seen DESC`,
      [req.params.id]
    );
    return reply.send(rows);
  });
}
