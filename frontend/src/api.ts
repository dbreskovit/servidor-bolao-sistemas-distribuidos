import type { Country, Match, MatchClient, RankingEntry } from "./types";

const CLIENT_ID = "server";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOpts {
  method?: string;
  token?: string;
  body?: unknown;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["X-Admin-Token"] = opts.token;

  const r = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ApiError(r.status, (data as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  return data as T;
}

export const api = {
  login: (password: string) =>
    request<{ token: string }>("/api/admin/login", { method: "POST", body: { password } }),

  currentMatch: () => request<Match>("/api/"),

  countries: () => request<Country[]>("/api/countries"),

  ranking: () => request<RankingEntry[]>("/api/ranking"),

  matchClients: (id: number, token: string) =>
    request<MatchClient[]>(`/api/matches/${id}/clients`, { token }),

  createMatch: (token: string, body: { team_a: string; team_b: string; kickoff_at?: string }) =>
    request<Match>("/api/matches", { method: "POST", token, body }),

  finishMatch: (token: string, id: number, score_a: number, score_b: number) =>
    request<unknown>(`/api/matches/${id}/result`, { method: "POST", token, body: { score_a, score_b } }),

  reset: (token: string) => request<{ ok: boolean }>("/api/admin/reset", { method: "POST", token }),
};
