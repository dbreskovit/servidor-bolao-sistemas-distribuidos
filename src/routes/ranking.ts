import { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function rankingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ranking", {
    schema: {
      tags: ["ranking"],
      summary: "Ranking geral por pontos",
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ranking: { type: "integer" },
              username: { type: "string" },
              points: { type: "number" },
            },
          },
        },
      },
    },
  }, async (_req, reply) => {
    const { rows } = await db.query(`
      SELECT u.username, COALESCE(SUM(p.points), 0) AS points
      FROM (
        SELECT username FROM players
        UNION
        SELECT username FROM predictions
      ) u
      LEFT JOIN predictions p ON p.username = u.username
      LEFT JOIN matches m ON m.id = p.match_id AND m.status = 'finished'
      GROUP BY u.username
      ORDER BY points DESC, u.username ASC
    `);

    let rank = 1;
    const result = rows.map((row, i) => {
      const pts = Number(row.points);
      if (i > 0 && Number(rows[i - 1].points) !== pts) {
        rank = i + 1;
      }
      return {
        ranking: i === 0 ? 1 : rank,
        username: row.username as string,
        points: pts,
      };
    });

    // fix first rank
    if (result.length > 0) result[0].ranking = 1;

    return reply.send(result);
  });
}
