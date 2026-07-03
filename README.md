# ⚽ Bolão Copa 2026 — Servidor

Servidor do bolão da Copa do Mundo 2026 para a disciplina de **Sistemas Distribuídos**: uma API HTTP pública consumida por **4 clientes em linguagens/SOs diferentes**, com painel administrativo em tempo real e documentação Swagger.

![Node](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-v4-000000?logo=fastify&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)

## Principais recursos

- **API 100% pública para os clientes** — consultar partida, palpitar, ranking e países, sem token nem credencial.
- **Painel admin em tempo real** — login por senha, feed de requisições ao vivo via WebSocket, cadastro e finalização de partidas.
- **Pontuação automática** — ao finalizar uma partida, todos os palpites são recalculados (exato = 10, vencedor = 5, erro = 0).
- **Contratos documentados** — Swagger interativo em `/docs` como fonte de verdade para os 4 times de clientes.
- **Auto-hospedado** — sobe tudo com um único `docker compose up`.

## Início rápido

```bash
cp .env.example .env
# edite .env e defina ADMIN_PASSWORD
docker compose up --build
```

| Serviço | URL local | Produção |
|---|---|---|
| API | http://localhost:8080/api/ | https://bolao.breskovit.cloud/api/ |
| Swagger (docs interativas) | http://localhost:8080/docs | https://bolao.breskovit.cloud/docs |
| Dashboard Admin | http://localhost:3001 | — |
| Health check | http://localhost:8080/health | https://bolao.breskovit.cloud/health |

## Estrutura de pastas do servidor

```
server/
├── src/                        # Backend — Node 20 + TypeScript + Fastify
│   ├── server.ts               # bootstrap do Fastify: plugins, rotas, CORS, Swagger, start
│   ├── db.ts                   # Pool do pg + migrate() + seed() idempotentes no boot
│   ├── auth.ts                 # login por senha (ADMIN_PASSWORD) + tokens de sessão (8h, em memória)
│   ├── scoring.ts              # calcPoints() — função pura da regra de pontuação
│   ├── monitor.ts              # estatísticas em memória + hub de WebSocket do dashboard
│   ├── logger.ts               # grava logs/requests.log e faz broadcast no WS
│   ├── countries.ts            # 48 países da Copa 2026 + bandeira emoji via ISO 3166
│   ├── types/                  # declarações de tipos auxiliares
│   └── routes/
│       ├── matches.ts          # GET /api/, /api/matches[/:id] · POST /api/match, /api/matches[/:id/result]
│       ├── ranking.ts          # GET /api/ranking
│       ├── countries.ts        # GET /api/countries
│       ├── admin.ts            # POST /api/admin/login
│       └── system.ts           # GET /health · WS /ws (monitoramento)
├── frontend/                   # Dashboard admin — React + Vite + Tailwind
│   └── src/                    # Login, Dashboard, gráficos e componentes de UI
├── public/                     # assets estáticos servidos pelo backend
├── scripts/
│   └── loadtest.mjs            # teste de carga da API
├── logs/                       # requests.log (volume no deploy)
├── Dockerfile                  # build multi-stage do backend (node:20-alpine)
├── Dockerfile.frontend         # build do dashboard + Nginx
├── nginx.conf                  # proxy do frontend para a API
├── docker-compose.yml          # db (Postgres 16) + app + frontend
├── API_PUBLICA.md              # documentação detalhada dos endpoints públicos
├── Postman_Bolao_API.json      # coleção Postman pronta para importar
└── README.md
```

## 🖥️ Clientes

A API serve **4 clientes**, cada um desenvolvido por um time em uma linguagem/SO diferente. Todas as rotas de cliente são **públicas** — basta consumir a API; o header `X-Client-Id` é opcional e serve apenas para identificar o cliente nos logs e no dashboard.

| Cliente | Linguagem | Repositório / Release |
|---|---|---|
| Cliente Python | 🐍 Python | [BolaoCopa2026-ClientePythonSD — Release v1](https://github.com/Talitavds/BolaoCopa2026-ClientePythonSD/releases/tag/v1) |
| Cliente B4A | 🤖 B4A (Android) | [cliente-android-darley](https://github.com/dbreskovit/cliente-android-darley) |
| Cliente React Native | ⚛️ React Native (Android) | [cliente-android-diego-duarte](https://github.com/dbreskovit/cliente-android-diego-duarte) |
| Cliente Electron | — | ⚛️ Electron (Windows) | [bolao-copa](https://github.com/GeovanePicolotto/bolao-copa) |

O que todo cliente precisa implementar (contratos completos no [API_PUBLICA.md](API_PUBLICA.md) e no Swagger `/docs`):

1. **Consulta** — `GET /api/` (partida atual) e `GET /api/matches` (todas as partidas);
2. **Cadastro** — `POST /api/match?id=:id` com `{ "username", "score_a", "score_b" }` (upsert: repetir o POST atualiza o palpite);
3. **Relatório** — `GET /api/ranking` (pontos somados por usuário, com empates compartilhando posição);
4. Enviar o header **`X-Client-Id`** (ex.: `cliente-python`) para aparecer identificado no monitoramento.

Base URL de produção: `https://bolao.breskovit.cloud`

## Operações da API

| Operação | Endpoint | Autenticação |
|---|---|---|
| Consulta partida atual | `GET /api/` | Pública |
| Lista partidas | `GET /api/matches` | Pública |
| Uma partida | `GET /api/matches/:id` | Pública |
| Cadastrar/atualizar palpite | `POST /api/match?id=:id` | Pública |
| Ranking | `GET /api/ranking` | Pública |
| Países da Copa | `GET /api/countries` | Pública |
| Login admin | `POST /api/admin/login` | Pública (é o login) |
| Criar partida | `POST /api/matches` | `X-Admin-Token` |
| Finalizar partida | `POST /api/matches/:id/result` | `X-Admin-Token` |
| Monitoramento em tempo real | `WS /ws?token=...` | Token de sessão |

### Exemplos curl

```bash
# Clientes — públicos (X-Client-Id é opcional, apenas identifica nos logs)
curl http://localhost:8080/api/
curl -H "X-Client-Id: cliente-python" http://localhost:8080/api/ranking
curl -X POST "http://localhost:8080/api/match?id=1" \
  -H "Content-Type: application/json" -H "X-Client-Id: cliente-java" \
  -d '{"username":"joao","score_a":3,"score_b":0}'

# Admin — login com senha, depois usa o token de sessão nas ações
TOKEN=$(curl -s -X POST http://localhost:8080/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"troque-esta-senha"}' | jq -r .token)

curl -X POST http://localhost:8080/api/matches \
  -H "Content-Type: application/json" -H "X-Admin-Token: $TOKEN" \
  -d '{"team_a":"Portugal","team_b":"Espanha"}'

curl -X POST "http://localhost:8080/api/matches/1/result" \
  -H "Content-Type: application/json" -H "X-Admin-Token: $TOKEN" \
  -d '{"score_a":3,"score_b":1}'
```

## Autenticação

- **Rotas de cliente = 100% públicas.** Nenhum token é necessário.
- `X-Client-Id` é opcional — rótulo de identificação nos logs, não autentica.
- **Painel admin** requer senha via `POST /api/admin/login`; retorna token de sessão (8h, em memória — some no restart, basta relogar).
- Ações admin (`POST /api/matches`, `POST /api/matches/:id/result`, WebSocket `/ws`) exigem `X-Admin-Token`.
- `ADMIN_PASSWORD` é o **único segredo** do sistema.

## Pontuação

| Resultado do palpite | Pontos |
|---|---|
| Placar exato | 10 |
| Acertou vencedor/empate | 5 |
| Errou | 0 |

Só existe **uma partida ativa por vez**: para cadastrar uma nova é preciso finalizar a atual. Ao finalizar, os pontos de todos os palpites daquela partida são recalculados e o ranking é atualizado.
