import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResourceSample } from "../types";

// Paleta validada (dataviz skill) contra a superfície #18181b
export const SERIES_1 = "#3987e5"; // azul
export const SERIES_2 = "#199e70"; // verde-água
const GRID = "#2c2c2a";
const MUTED = "#898781";

interface TipPayload {
  name?: string;
  value?: number | string;
  color?: string;
  unit?: string;
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs shadow-md">
      {label !== undefined && <div className="mb-1 font-medium text-zinc-300">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium text-zinc-100 [font-variant-numeric:tabular-nums]">
            {p.value}
            {p.unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LegendInline({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ResourcesChart({ history, height = 170 }: { history: ResourceSample[]; height?: number }) {
  const data = history.map((s) => ({
    time: new Date(s.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: s.cpu,
    mem: Math.round((s.memUsed / s.memLimit) * 1000) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="time"
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
        />
        <YAxis
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
          unit="%"
          domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]}
        />
        <Tooltip content={<ChartTip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="cpu"
          name="CPU"
          unit="%"
          stroke={SERIES_1}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#18181b" }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="mem"
          name="Memória"
          unit="%"
          stroke={SERIES_2}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#18181b" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Cores fixas pros códigos mais comuns; o resto cai na paleta da classe.
const STATUS_FIXED_COLORS: Record<string, string> = {
  "404": "#ec835a", // vermelho salmão
  "500": "#d03b3b", // vermelho forte
};

// Cores por classe de status (paleta de status da skill, validada pra superfície escura).
// Dentro da mesma classe os códigos recebem tons distintos, na ordem em que aparecem.
const STATUS_CLASS_COLORS: Record<string, string[]> = {
  "2": ["#0ca30c", "#4db84d", "#86cf86"],
  "3": ["#3987e5", "#6da7ec", "#9ec5f4"],
  "4": ["#fab219", "#e66767", "#d55181"],
  "5": ["#a72f2f", "#e66767"],
};

export function statusColors(codes: string[]): Map<string, string> {
  const used: Record<string, number> = {};
  const map = new Map<string, string>();
  for (const code of [...codes].sort()) {
    const fixed = STATUS_FIXED_COLORS[code];
    if (fixed) {
      map.set(code, fixed);
      continue;
    }
    const cls = code[0];
    const pool = STATUS_CLASS_COLORS[cls] ?? ["#898781"];
    const i = used[cls] ?? 0;
    map.set(code, pool[Math.min(i, pool.length - 1)]);
    used[cls] = i + 1;
  }
  return map;
}

export function StatusChart({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  if (total === 0) {
    return <div className="flex h-[130px] items-center justify-center text-xs text-zinc-500">nenhuma request ainda</div>;
  }

  const colors = statusColors(entries.map(([code]) => code));
  const data = entries.map(([code, count]) => ({ name: code, value: count }));

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[130px] w-[130px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={38}
              outerRadius={58}
              paddingAngle={2}
              stroke="#18181b"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={colors.get(d.name)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-zinc-50 [font-variant-numeric:tabular-nums]">{total}</span>
          <span className="text-[9px] text-zinc-500">requests</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {entries.slice(0, 5).map(([code, count]) => (
          <div key={code} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.get(code) }} />
            <span className="font-mono text-zinc-300">{code}</span>
            <span className="ml-auto text-zinc-500 [font-variant-numeric:tabular-nums]">
              {count} · {((count / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {entries.length > 5 && <div className="text-[10px] text-zinc-600">+{entries.length - 5} outros</div>}
      </div>
    </div>
  );
}

export function EndpointsChart({ byRoute, height = 170 }: { byRoute: Record<string, number>; height?: number }) {
  const data = Object.entries(byRoute)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-zinc-500" style={{ height }}>
        nenhuma request ainda
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={160}
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fontFamily: "ui-monospace, monospace" }}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="count" name="Requests" fill={SERIES_1} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
