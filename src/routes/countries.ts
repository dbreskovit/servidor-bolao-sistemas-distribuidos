import { FastifyInstance } from "fastify";
import { COUNTRIES, countryFlag } from "../countries.js";

export async function countriesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/countries", {
    schema: {
      tags: ["countries"],
      summary: "Lista os 48 países da Copa 2026",
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              iso2: { type: "string" },
              flag: { type: "string" },
            },
          },
        },
      },
    },
  }, async (_req, reply) => {
    return reply.send(
      COUNTRIES.map((c) => ({ name: c.name, iso2: c.iso2, flag: countryFlag(c) }))
    );
  });
}
