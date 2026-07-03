import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Clock,
  Cpu,
  Flag,
  LogOut,
  MemoryStick,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { api, ApiError } from "./api";
import { fmtBytes, fmtDateTime, fmtTime, fmtUptime, parseServerTime } from "./lib";
import type { Country, Match, MatchClient, RankingEntry, RequestEntry, Snapshot } from "./types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Muted,
  Select,
  cn,
} from "./components/ui";
import { EndpointsChart, LegendInline, ResourcesChart, SERIES_1, SERIES_2, StatusChart } from "./components/charts";

const STATUS_OK = "#0ca30c";
const STATUS_ERR = "#d03b3b";

interface Props {
  token: string;
  onLogout: () => void;
}

export default function Dashboard({ token, onLogout }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [wsOk, setWsOk] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [matchLoaded, setMatchLoaded] = useState(false);
  const [clients, setClients] = useState<MatchClient[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    },
    [onLogout]
  );

  const refreshMatch = useCallback(async () => {
    try {
      const m = await api.currentMatch();
      setMatch(m);
      const c = await api.matchClients(m.id, token);
      setClients(c);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setMatch(null);
        setClients([]);
      } else {
        handleAuthError(e);
      }
    } finally {
      setMatchLoaded(true);
    }
  }, [token, handleAuthError]);

  const refreshRanking = useCallback(async () => {
    try {
      setRanking(await api.ranking());
    } catch {
      /* transient */
    }
  }, []);

  // ref para o handler do WS não capturar closures velhas
  const refreshRef = useRef(() => {});
  refreshRef.current = () => {
    void refreshMatch();
    void refreshRanking();
  };

  // carga inicial + refresh periódico de fallback
  useEffect(() => {
    void refreshMatch();
    void refreshRanking();
    api.countries().then(setCountries).catch(() => {});
    const t = setInterval(() => refreshRef.current(), 60_000);
    return () => clearInterval(t);
  }, [refreshMatch, refreshRanking]);

  // WebSocket com reconexão
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
      ws.onopen = () => setWsOk(true);
      ws.onclose = () => {
        setWsOk(false);
        if (!closed) retry = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as { type?: string; snapshot?: Snapshot; data?: RequestEntry };
        if (msg.snapshot) setSnapshot(msg.snapshot);
        if (msg.type === "request" && msg.data) {
          const d = msg.data;
          if (d.method === "POST" && (d.path === "/api/match" || d.path.startsWith("/api/matches"))) {
            refreshRef.current();
          }
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [token]);

  // taxa de req/s derivada dos snapshots (chegam a cada ~5s via WS)
  const rateRef = useRef<{ t: number; total: number }[]>([]);
  const [rates, setRates] = useState<number[]>([]);
  useEffect(() => {
    if (!snapshot) return;
    const h = rateRef.current;
    h.push({ t: Date.now(), total: snapshot.totalRequests });
    if (h.length > 25) h.shift();
    const rs: number[] = [];
    for (let i = 1; i < h.length; i++) {
      const dt = (h[i].t - h[i - 1].t) / 1000;
      rs.push(dt > 0.5 ? Math.max(0, (h[i].total - h[i - 1].total) / dt) : 0);
    }
    setRates(rs);
  }, [snapshot]);

  const last = snapshot?.resources[snapshot.resources.length - 1];
  const memPct = last ? Math.round((last.memUsed / last.memLimit) * 100) : null;
  const rate = rates.length > 0 ? rates[rates.length - 1] : 0;
  const memColor = memPct !== null && memPct > 85 ? "#d03b3b" : memPct !== null && memPct > 65 ? "#fab219" : SERIES_2;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <h1 className="text-sm font-semibold text-zinc-100">⚽ Bolão Admin</h1>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className={cn("h-2 w-2 rounded-full", !wsOk && "animate-pulse")}
                style={{ background: wsOk ? STATUS_OK : STATUS_ERR }}
              />
              {wsOk ? "conectado" : "reconectando..."}
            </span>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-3.5 w-3.5" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 p-3">
        {/* stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title="Requests"
            icon={<Activity className="h-4 w-4 text-zinc-600" />}
            value={snapshot ? snapshot.totalRequests.toLocaleString("pt-BR") : "—"}
            sub={snapshot ? `porta ${snapshot.port} · ${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} req/s` : ""}
            spark={rates}
            sparkColor="#8a68d8"
          />
          <StatCard
            title="Uptime"
            icon={<Clock className="h-4 w-4 text-zinc-600" />}
            value={snapshot ? fmtUptime(snapshot.startedAt) : "—"}
            sub={snapshot ? `desde ${fmtDateTime(new Date(snapshot.startedAt))}` : ""}
          />
          <StatCard
            title="CPU do Processo"
            icon={<Cpu className="h-4 w-4 text-zinc-600" />}
            value={last ? `${last.cpu.toFixed(1)}%` : "—"}
            sub={snapshot ? `${snapshot.cores} cores disponíveis` : ""}
            spark={snapshot?.resources.map((r) => r.cpu)}
            sparkColor={SERIES_1}
          />
          <StatCard
            title="Memória do Container"
            icon={<MemoryStick className="h-4 w-4 text-zinc-600" />}
            value={last ? fmtBytes(last.memUsed) : "—"}
            sub={last ? `${memPct}% de ${fmtBytes(last.memLimit)} · rss ${fmtBytes(last.rss)}` : ""}
            barPct={memPct ?? undefined}
            sparkColor={memColor}
          />
        </div>

        {/* charts */}
        <div className="grid gap-3 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Recursos do Container</CardTitle>
                <CardDescription>CPU e memória · últimos 10 min</CardDescription>
              </div>
              <LegendInline
                items={[
                  { label: "CPU", color: SERIES_1 },
                  { label: "Memória", color: SERIES_2 },
                ]}
              />
            </CardHeader>
            <CardContent>
              {snapshot ? (
                <ResourcesChart history={snapshot.resources} />
              ) : (
                <div className="flex h-[170px] items-center justify-center text-xs text-zinc-500">
                  aguardando dados...
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>Requests por Endpoint</CardTitle>
              <CardDescription>top 6 rotas mais acessadas</CardDescription>
            </CardHeader>
            <CardContent>
              <EndpointsChart byRoute={snapshot?.byRoute ?? {}} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Status Codes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatusChart byStatus={snapshot?.byStatus ?? {}} />
              <div className="border-t border-zinc-800 pt-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Users className="h-3 w-3" /> Clientes recentes (5 min)
                </div>
                {snapshot && snapshot.recentClients.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {snapshot.recentClients.slice(0, 4).map((c) => (
                      <Badge key={`${c.ip}|${c.client}`}>
                        {c.client} · {c.ip}
                      </Badge>
                    ))}
                    {snapshot.recentClients.length > 4 && <Badge>+{snapshot.recentClients.length - 4}</Badge>}
                  </div>
                ) : (
                  <Muted>nenhum ainda</Muted>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* feed + partida + gestão */}
        <div className="grid gap-3 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Feed de Requests</CardTitle>
              <CardDescription>ao vivo via WebSocket · últimas 50</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <Feed entries={snapshot?.recentRequests ?? []} />
            </CardContent>
          </Card>

          <CurrentMatchCard
            token={token}
            match={match}
            loaded={matchLoaded}
            clients={clients}
            onChanged={() => refreshRef.current()}
            onAuthError={handleAuthError}
          />

          <div className="space-y-3 lg:col-span-3">
            <CreateMatchCard
              token={token}
              countries={countries}
              disabled={match?.status === "scheduled"}
              onChanged={() => refreshRef.current()}
              onAuthError={handleAuthError}
            />
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Trophy className="h-4 w-4 text-zinc-500" />
                <CardTitle>Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                {ranking.length === 0 ? (
                  <Muted>nenhum jogador</Muted>
                ) : (
                  <div className="max-h-[120px] space-y-0.5 overflow-auto">
                    {ranking.map((r) => (
                      <div
                        key={r.username}
                        className="flex items-center justify-between rounded px-1.5 py-1 text-xs hover:bg-zinc-800/50"
                      >
                        <span className="truncate text-zinc-200">
                          <span className="mr-1.5 inline-block w-5 text-right text-zinc-500 [font-variant-numeric:tabular-nums]">
                            {r.ranking}º
                          </span>
                          {r.username}
                        </span>
                        <span className="shrink-0 font-medium text-zinc-100 [font-variant-numeric:tabular-nums]">
                          {r.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* danger zone (colapsada) */}
        <DangerZoneCard token={token} onChanged={() => refreshRef.current()} onAuthError={handleAuthError} />
      </main>
    </div>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 88;
  const h = 30;
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const pts = data.slice(-24);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const line = pts
    .map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 opacity-90" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({
  title,
  icon,
  value,
  sub,
  spark,
  sparkColor = "#71717a",
  barPct,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  spark?: number[];
  sparkColor?: string;
  barPct?: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</span>
        {icon}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none text-zinc-50 [font-variant-numeric:tabular-nums]">
            {value}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-zinc-500">{sub}</p>
        </div>
        {spark && <Spark data={spark} color={sparkColor} />}
      </div>
      {barPct !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(barPct, 100)}%`, background: sparkColor }}
          />
        </div>
      )}
    </Card>
  );
}

function Feed({ entries }: { entries: RequestEntry[] }) {
  if (entries.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-xs text-zinc-500">nenhuma request ainda</div>;
  }
  return (
    <div className="h-[300px] overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-zinc-900 text-left text-zinc-500">
          <tr>
            <th className="px-3 py-1 font-medium">Hora</th>
            <th className="px-2 py-1 font-medium">Status</th>
            <th className="px-2 py-1 font-medium">Rota</th>
            <th className="px-2 py-1 font-medium">Cliente</th>
            <th className="px-3 py-1 text-right font-medium">ms</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map((r, i) => (
            <tr key={`${r.time}-${i}`} className="border-t border-zinc-800/60 hover:bg-zinc-800/40">
              <td className="px-3 py-1 text-zinc-500 [font-variant-numeric:tabular-nums]">{fmtTime(r.time)}</td>
              <td className="px-2 py-1 font-semibold" style={{ color: r.status >= 400 ? STATUS_ERR : STATUS_OK }}>
                {r.status}
              </td>
              <td className="max-w-[200px] truncate px-2 py-1 text-zinc-300">
                {r.method} {r.path}
              </td>
              <td className="px-2 py-1 text-zinc-500">{r.client}</td>
              <td className="px-3 py-1 text-right text-zinc-500 [font-variant-numeric:tabular-nums]">{r.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CurrentMatchCard({
  token,
  match,
  loaded,
  clients,
  onChanged,
  onAuthError,
}: {
  token: string;
  match: Match | null;
  loaded: boolean;
  clients: MatchClient[];
  onChanged: () => void;
  onAuthError: (e: unknown) => void;
}) {
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!match) return;
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) {
      setError("Placares inválidos");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.finishMatch(token, match.id, a, b);
      onChanged();
    } catch (e) {
      onAuthError(e);
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-4">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-zinc-500" />
          <CardTitle>Partida Atual</CardTitle>
        </div>
        {match && <Badge>{match.status === "scheduled" ? "agendada" : "finalizada"}</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? (
          <Muted>carregando...</Muted>
        ) : !match ? (
          <Muted>nenhuma partida cadastrada</Muted>
        ) : (
          <>
            <div className="text-center text-base font-semibold text-zinc-100">
              {match.team_a.flag} {match.team_a.name} <span className="text-zinc-500">vs</span> {match.team_b.flag}{" "}
              {match.team_b.name}
              {match.real_score && (
                <span className="ml-2 text-zinc-300 [font-variant-numeric:tabular-nums]">
                  {match.real_score.a} x {match.real_score.b}
                </span>
              )}
            </div>
            {match.status === "scheduled" && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block truncate text-[11px] text-zinc-400">{match.team_a.name}</label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block truncate text-[11px] text-zinc-400">{match.team_b.name}</label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                  />
                </div>
                <Button size="sm" className="h-8 shrink-0" onClick={finish} disabled={busy}>
                  ✅ Finalizar
                </Button>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="border-t border-zinc-800 pt-2">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Palpites recebidos ({clients.length})
                </span>
                <button className="text-zinc-500 hover:text-zinc-300" onClick={onChanged} title="Atualizar">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
              {clients.length === 0 ? (
                <Muted>nenhum palpite ainda</Muted>
              ) : (
                <div className="max-h-[120px] space-y-1 overflow-auto">
                  {clients.map((c) => (
                    <div
                      key={`${c.ip}|${c.client}`}
                      className="flex items-center justify-between rounded bg-zinc-950 px-2 py-1 text-[11px]"
                    >
                      <span className="truncate">
                        <span className="font-medium text-zinc-200">{c.username}</span>
                        <span className="ml-2 text-zinc-500">
                          {c.ip} · {c.client}
                        </span>
                      </span>
                      <span className="ml-2 shrink-0 text-zinc-500 [font-variant-numeric:tabular-nums]">
                        {c.request_count}x · {fmtDateTime(parseServerTime(c.last_seen))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CreateMatchCard({
  token,
  countries,
  disabled,
  onChanged,
  onAuthError,
}: {
  token: string;
  countries: Country[];
  disabled: boolean;
  onChanged: () => void;
  onAuthError: (e: unknown) => void;
}) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (countries.length > 1 && !teamA) {
      setTeamA(countries[0].name);
      setTeamB(countries[1].name);
    }
  }, [countries, teamA]);

  async function create() {
    if (teamA === teamB) {
      setError("Times devem ser diferentes");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body: { team_a: string; team_b: string; kickoff_at?: string } = { team_a: teamA, team_b: teamB };
      if (kickoff) body.kickoff_at = new Date(kickoff).toISOString();
      await api.createMatch(token, body);
      onChanged();
    } catch (e) {
      onAuthError(e);
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Plus className="h-4 w-4 text-zinc-500" />
        <CardTitle>Nova Partida</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Select className="h-8" value={teamA} onChange={(e) => setTeamA(e.target.value)} disabled={disabled}>
            {countries.map((c) => (
              <option key={c.name} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </Select>
          <Select className="h-8" value={teamB} onChange={(e) => setTeamB(e.target.value)} disabled={disabled}>
            {countries.map((c) => (
              <option key={c.name} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Input
            type="datetime-local"
            className="h-8 flex-1"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            disabled={disabled}
          />
          <Button size="sm" className="h-8 shrink-0" onClick={create} disabled={disabled || busy || countries.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Criar
          </Button>
        </div>
        {disabled && <p className="text-[11px] text-amber-500">Finalize a partida atual antes de cadastrar outra.</p>}
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}

function DangerZoneCard({
  token,
  onChanged,
  onAuthError,
}: {
  token: string;
  onChanged: () => void;
  onAuthError: (e: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function click() {
    if (!confirming) {
      setConfirming(true);
      timer.current = window.setTimeout(() => setConfirming(false), 5000);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    setBusy(true);
    setError("");
    try {
      await api.reset(token);
      onChanged();
    } catch (e) {
      onAuthError(e);
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-red-900/40">
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-red-400">
          <Trash2 className="h-4 w-4" /> Zona de Perigo
        </span>
        <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/60 px-4 py-3">
          <p className="text-xs text-zinc-500">
            Apaga todas as partidas, palpites e logs. Os jogadores cadastrados (Diego e Cauã) são mantidos, voltando a
            0 pontos.
          </p>
          <Button variant="destructive" size="sm" onClick={click} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
            {confirming ? "Clique de novo para confirmar" : "Limpar Banco de Dados"}
          </Button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Card>
  );
}
