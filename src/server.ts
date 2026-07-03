import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "path";
import { migrate, seed } from "./db.js";
import { ensureLogDir, logRequest } from "./logger.js";
import { matchRoutes } from "./routes/matches.js";
import { rankingRoutes } from "./routes/ranking.js";
import { countriesRoutes } from "./routes/countries.js";
import { adminRoutes } from "./routes/admin.js";
import { systemRoutes } from "./routes/system.js";
import { stats, startResourceSampler } from "./monitor.js";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
stats.port = PORT;

const app = Fastify({ trustProxy: true, logger: true });

async function start() {
  ensureLogDir();

  await app.register(cors, {
    origin: true,
    allowedHeaders: ["Content-Type", "X-Client-Id", "X-Admin-Token"],
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Bolão API", version: "1.0.0", description: "API do Bolão de Futebol" },
      components: {
        securitySchemes: {
          adminToken: {
            type: "apiKey",
            in: "header",
            name: "X-Admin-Token",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list" } });

  await app.register(websocket);

  // log hook
  app.addHook("onResponse", (request, reply, done) => {
    logRequest(request, reply, reply.elapsedTime);
    done();
  });

  await app.register(matchRoutes);
  await app.register(rankingRoutes);
  await app.register(countriesRoutes);
  await app.register(adminRoutes);
  await app.register(systemRoutes);

  // Static files — after custom routes so /dashboard route takes precedence
  await app.register(staticFiles, {
    root: path.join(process.cwd(), "public"),
    prefix: "/",
  });

  await migrate();
  await seed();

  startResourceSampler();

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Server listening on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
