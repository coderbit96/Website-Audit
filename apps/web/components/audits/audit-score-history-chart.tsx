"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ScoreSet = {
  OVERALL: number | null;
  SEO: number | null;
  TECHNICAL: number | null;
  PERFORMANCE: number | null;
  ACCESSIBILITY: number | null;
  SECURITY: number | null;
  MOBILE: number | null;
};

export type ScoreHistoryPoint = {
  auditId: string;
  completedAt: string;
  scores: ScoreSet;
};

const categoryLines = [
  { key: "SEO", label: "SEO", color: "#0891b2" },
  { key: "TECHNICAL", label: "Technical", color: "#6366f1" },
  { key: "PERFORMANCE", label: "Performance", color: "#f59e0b" },
  { key: "ACCESSIBILITY", label: "Accessibility", color: "#8b5cf6" },
  { key: "SECURITY", label: "Security", color: "#059669" },
  { key: "MOBILE", label: "Mobile", color: "#e11d48" },
] as const;

function chartDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function AuditScoreHistoryChart({
  points,
}: {
  points: readonly ScoreHistoryPoint[];
}) {
  const data = points.map((point) => ({
    label: chartDate(point.completedAt),
    Overall:
      point.scores.OVERALL === null ? null : Math.round(point.scores.OVERALL),
    SEO: point.scores.SEO === null ? null : Math.round(point.scores.SEO),
    Technical:
      point.scores.TECHNICAL === null
        ? null
        : Math.round(point.scores.TECHNICAL),
    Performance:
      point.scores.PERFORMANCE === null
        ? null
        : Math.round(point.scores.PERFORMANCE),
    Accessibility:
      point.scores.ACCESSIBILITY === null
        ? null
        : Math.round(point.scores.ACCESSIBILITY),
    Security:
      point.scores.SECURITY === null ? null : Math.round(point.scores.SECURITY),
    Mobile:
      point.scores.MOBILE === null ? null : Math.round(point.scores.MOBILE),
  }));

  const commonTooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--app-panel-raised)",
        border: "1px solid var(--app-border-strong)",
        borderRadius: "12px",
        boxShadow: "var(--app-shadow-lg)",
        fontSize: "12px",
      }}
      labelStyle={{ color: "var(--app-text)" }}
      cursor={{ stroke: "var(--app-border-strong)", strokeWidth: 1 }}
    />
  );

  return (
    <div className="audit-history-chart-grid">
      <article className="audit-history-chart-card">
        <header>
          <div>
            <span>Overall health</span>
            <h3>Overall score trend</h3>
          </div>
          <small>{points.length} completed audits</small>
        </header>
        <div
          className="audit-history-chart-canvas"
          role="img"
          aria-label="Overall audit score over time"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 10, bottom: 0, left: -8 }}
            >
              <CartesianGrid
                stroke="rgba(148, 163, 184, 0.12)"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: "var(--app-subtle)", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "var(--app-subtle)", fontSize: 11 }}
                tickLine={false}
                width={38}
              />
              {commonTooltip}
              <Line
                connectNulls={false}
                dataKey="Overall"
                dot={{ fill: "var(--app-accent)", r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
                stroke="var(--app-accent)"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="audit-history-chart-card">
        <header>
          <div>
            <span>Category health</span>
            <h3>Category score trends</h3>
          </div>
          <small>N/A values are omitted</small>
        </header>
        <div
          className="audit-history-chart-canvas"
          role="img"
          aria-label="Audit category scores over time"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 10, bottom: 0, left: -8 }}
            >
              <CartesianGrid
                stroke="rgba(148, 163, 184, 0.12)"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: "var(--app-subtle)", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "var(--app-subtle)", fontSize: 11 }}
                tickLine={false}
                width={38}
              />
              {commonTooltip}
              <Legend
                wrapperStyle={{ color: "var(--app-muted)", fontSize: 11 }}
              />
              {categoryLines.map((line) => (
                <Line
                  connectNulls={false}
                  dataKey={line.label}
                  dot={false}
                  isAnimationActive={false}
                  key={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  );
}
