#!/usr/bin/env node
/**
 * Teste de carga da API do Bolão — sem dependências (Node >= 18).
 *
 * Uso:
 *   node scripts/loadtest.mjs [--url URL] [--vus N] [--duration S] [--writes] [--ramp S]
 *
 * Exemplos:
 *   node scripts/loadtest.mjs --url https://bolao.breskovit.cloud --vus 10 --duration 30
 *   node scripts/loadtest.mjs --url https://bolao.breskovit.cloud --vus 50 --duration 60 --ramp 10
 *   node scripts/loadtest.mjs --url https://bolao.breskovit.cloud --vus 20 --duration 30 --writes
 *
 * Flags:
 *   --url       Base da API (default: https://bolao.breskovit.cloud)
 *   --vus       Usuários virtuais simultâneos (default: 10)
 *   --duration  Duração em segundos (default: 30)
 *   --ramp      Sobe os VUs gradualmente ao longo de S segundos (default: 0 = todos de uma vez)
 *   --writes    Inclui POST de palpites (5% do tráfego, usernames "loadtest_vuN").
 *               Só funciona se houver partida agendada; o reset do admin limpa esses palpites.
 *
 * As requests vão com X-Client-Id: loadtest — dá pra acompanhar ao vivo no dashboard.
 */

import { performance } from "node:perf_hooks";

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  return args.includes(`--${name}`);
}
function opt(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
}

const BASE = opt("url", "https://bolao.breskovit.cloud").replace(/\/$/, "");
const VUS = Math.max(1, parseInt(opt("vus", "10"), 10));
const DURATION = Math.max(1, parseInt(opt("duration", "30"), 10));
const RAMP = Math.max(0, parseInt(opt("ramp", "0"), 10));
const WRITES = flag("writes");

const HEADERS = { "X-Client-Id": "loadtest" };

// ── endpoints e pesos ────────────────────────────────────────────────────────
// [nome, peso, factory de request]
const READ_ENDPOINTS = [
  ["GET /api/", 40, () => ({ url: `${BASE}/api/` })],
  ["GET /api/ranking", 25, () => ({ url: `${BASE}/api/ranking` })],
  ["GET /api/matches", 20, () => ({ url: `${BASE}/api/matches` })],
  ["GET /api/countries", 10, () => ({ url: `${BASE}/api/countries` })],
];

let scheduledMatchId = null;

function buildEndpoints(vuId) {
  const eps = READ_ENDPOINTS.map(([name, weight, make]) => ({ name, weight, make }));
  if (WRITES && scheduledMatchId !== null) {
    eps.push({
      name: "POST /api/match",
      weight: 5,
      make: () => ({
        url: `${BASE}/api/match?id=${scheduledMatchId}`,
        init: {
          method: "POST",
          headers: { ...HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            username: `loadtest_vu${vuId}`,
            score_a: Math.floor(Math.random() * 5),
            score_b: Math.floor(Math.random() * 5),
          }),
        },
      }),
    });
  }
  const total = eps.reduce((s, e) => s + e.weight, 0);
  return { eps, total };
}

function pick(eps, total) {
  let r = Math.random() * total;
  for (const e of eps) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return eps[eps.length - 1];
}

// ── métricas ─────────────────────────────────────────────────────────────────
const routes = new Map(); // nome -> { count, errors, statuses: Map, latencies: [] }
let totalDone = 0;
let totalErrors = 0;
let windowCount = 0; // requests na janela do último segundo

function routeStats(name) {
  let s = routes.get(name);
  if (!s) {
    s = { count: 0, errors: 0, statuses: new Map(), latencies: [] };
    routes.set(name, s);
  }
  return s;
}

function record(name, ms, status) {
  const s = routeStats(name);
  s.count++;
  s.latencies.push(ms);
  if (status === null) {
    s.errors++;
    totalErrors++;
  } else {
    s.statuses.set(status, (s.statuses.get(status) ?? 0) + 1);
    // 4xx é resposta válida da aplicação (ex: 404 quando não há partida);
    // só 5xx e falha de rede contam como erro do servidor
    if (status >= 500) totalErrors++;
  }
  totalDone++;
  windowCount++;
}

function pctl(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const fmtMs = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + "s" : n.toFixed(0) + "ms");

// ── VU loop ──────────────────────────────────────────────────────────────────
async function vu(id, endAt) {
  const { eps, total } = buildEndpoints(id);
  while (Date.now() < endAt) {
    const ep = pick(eps, total);
    const { url, init } = ep.make();
    const t0 = performance.now();
    try {
      const r = await fetch(url, init ?? { headers: HEADERS });
      await r.arrayBuffer(); // drena o corpo pra liberar a conexão
      record(ep.name, performance.now() - t0, r.status);
    } catch {
      record(ep.name, performance.now() - t0, null);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎯 Alvo: ${BASE}`);
  console.log(`   VUs: ${VUS} · duração: ${DURATION}s · ramp: ${RAMP}s · writes: ${WRITES ? "sim" : "não"}\n`);

  // sanity check + descobre partida agendada (para --writes)
  try {
    const r = await fetch(`${BASE}/api/`, { headers: HEADERS });
    if (r.ok) {
      const m = await r.json();
      if (m.status === "scheduled") scheduledMatchId = m.id;
    }
  } catch (e) {
    console.error(`❌ Não consegui alcançar ${BASE}/api/ — ${e.message ?? e}`);
    process.exit(1);
  }
  if (WRITES && scheduledMatchId === null) {
    console.log("⚠️  --writes ignorado: nenhuma partida agendada no momento.\n");
  }

  const startAt = Date.now();
  const endAt = startAt + DURATION * 1000;

  // progresso por segundo
  const progress = setInterval(() => {
    const elapsed = ((Date.now() - startAt) / 1000).toFixed(0);
    process.stdout.write(
      `\r⏱  ${elapsed}s/${DURATION}s · ${totalDone} reqs · ${windowCount} rps · ${totalErrors} erros   `
    );
    windowCount = 0;
  }, 1000);

  // sobe os VUs (com ramp opcional)
  const vus = [];
  for (let i = 0; i < VUS; i++) {
    const delay = RAMP > 0 ? (i / VUS) * RAMP * 1000 : 0;
    vus.push(
      new Promise((resolve) => {
        setTimeout(() => vu(i + 1, endAt).then(resolve), delay);
      })
    );
  }
  await Promise.all(vus);
  clearInterval(progress);

  // ── relatório ──────────────────────────────────────────────────────────────
  const wall = (Date.now() - startAt) / 1000;
  const all = [...routes.values()].flatMap((s) => s.latencies).sort((a, b) => a - b);

  console.log(`\n\n${"═".repeat(74)}`);
  console.log(`RESULTADO · ${totalDone} requests em ${wall.toFixed(1)}s · ${(totalDone / wall).toFixed(1)} req/s média`);
  console.log("═".repeat(74));
  console.log(
    `Latência  ·  min ${fmtMs(all[0] ?? 0)} · p50 ${fmtMs(pctl(all, 50))} · p90 ${fmtMs(pctl(all, 90))}` +
      ` · p99 ${fmtMs(pctl(all, 99))} · max ${fmtMs(all[all.length - 1] ?? 0)}`
  );
  console.log(`Erros     ·  ${totalErrors} (${totalDone ? ((totalErrors / totalDone) * 100).toFixed(2) : 0}%)`);
  console.log("─".repeat(74));
  console.log(
    "Rota".padEnd(24) + "reqs".padStart(7) + "p50".padStart(9) + "p99".padStart(9) + "  status"
  );
  console.log("─".repeat(74));

  const sorted = [...routes.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [name, s] of sorted) {
    const lats = [...s.latencies].sort((a, b) => a - b);
    const statuses = [...s.statuses.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([code, n]) => `${code}×${n}`)
      .join(" ");
    const errPart = s.errors > 0 ? ` net-err×${s.errors}` : "";
    console.log(
      name.padEnd(24) +
        String(s.count).padStart(7) +
        fmtMs(pctl(lats, 50)).padStart(9) +
        fmtMs(pctl(lats, 99)).padStart(9) +
        "  " +
        statuses +
        errPart
    );
  }
  console.log("═".repeat(74));

  if (WRITES && scheduledMatchId !== null) {
    console.log(`\n💡 Palpites de teste criados com usernames loadtest_vu1..${VUS} na partida ${scheduledMatchId}.`);
    console.log("   O botão 'Limpar Banco de Dados' no painel admin remove tudo.");
  }
  console.log();
}

main();
