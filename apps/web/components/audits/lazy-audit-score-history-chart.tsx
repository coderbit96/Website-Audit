"use client";

import dynamic from "next/dynamic";

import type { ScoreHistoryPoint } from "./audit-score-history-chart";

const AuditScoreHistoryChart = dynamic(
  () =>
    import("./audit-score-history-chart").then(
      (module) => module.AuditScoreHistoryChart,
    ),
  {
    loading: () => (
      <div className="audit-history-trend-empty" aria-busy="true">
        <div>
          <h3>Loading score trends</h3>
          <p>Preparing the interactive score history.</p>
        </div>
      </div>
    ),
    ssr: false,
  },
);

export function LazyAuditScoreHistoryChart({
  points,
}: {
  points: readonly ScoreHistoryPoint[];
}) {
  return <AuditScoreHistoryChart points={points} />;
}
