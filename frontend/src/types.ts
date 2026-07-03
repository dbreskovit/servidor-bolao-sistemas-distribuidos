export interface RequestEntry {
  time: string;
  ip: string;
  client: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

export interface RecentClient {
  ip: string;
  client: string;
  lastSeen: number;
}

export interface ResourceSample {
  time: string;
  cpu: number;
  rss: number;
  heapUsed: number;
  memUsed: number;
  memLimit: number;
}

export interface Snapshot {
  startedAt: string;
  port: number;
  totalRequests: number;
  byRoute: Record<string, number>;
  byStatus?: Record<string, number>;
  recentRequests: RequestEntry[];
  recentClients: RecentClient[];
  resources: ResourceSample[];
  cores: number;
}

export interface Team {
  name: string;
  flag: string;
}

export interface Match {
  id: number;
  team_a: Team;
  team_b: Team;
  kickoff_at: string;
  status: "scheduled" | "finished";
  real_score?: { a: number; b: number };
}

export interface MatchClient {
  ip: string;
  client: string;
  username: string;
  first_seen: string;
  last_seen: string;
  request_count: number;
}

export interface RankingEntry {
  ranking: number;
  username: string;
  points: number;
}

export interface Country {
  name: string;
  flag: string;
}
