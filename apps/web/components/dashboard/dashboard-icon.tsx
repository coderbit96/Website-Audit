import type { DashboardIconName } from "../../lib/dashboard/navigation";

const iconPaths: Record<DashboardIconName, readonly string[]> = {
  overview: ["M4 13h6V4H4v9Zm0 7h6v-3H4v3Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z"],
  websites: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M3.6 9h16.8M3.6 15h16.8M12 3c2 2.2 3 5.2 3 9s-1 6.8-3 9c-2-2.2-3-5.2-3-9s1-6.8 3-9Z",
  ],
  audits: [
    "M9 4h6M9 2v4m6-4v4M6 5h12a2 2 0 0 1 2 2v13H4V7a2 2 0 0 1 2-2Z",
    "m8 13 2.5 2.5L16 10",
  ],
  issues: [
    "M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z",
    "M12 9v4m0 3h.01",
  ],
  reports: ["M6 2h9l4 4v16H6V2Z", "M14 2v5h5M9 12h6m-6 4h6"],
  compare: [
    "M8 3 4 7l4 4M4 7h12a4 4 0 0 1 4 4v1M16 21l4-4-4-4m4 4H8a4 4 0 0 1-4-4v-1",
  ],
  schedule: [
    "M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
    "M9 13h2v2H9v-2Zm4 0h2v2h-2v-2Z",
  ],
  leads: [
    "M4 20v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-8v4m-2-2h4",
  ],
  clients: ["M4 21V7h10v14M14 11h6v10M8 11h2m-2 4h2m-2 4h2m8-4h.01m0 4h.01"],
  team: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  ],
  billing: ["M3 6h18v12H3V6Z", "M3 10h18M7 15h3"],
  notifications: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"],
  settings: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.5 1V21h-4v-.08A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1-1.5H2v-4h.08A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1.5-1V2h4v.08A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1 1.5h.6v4h-.08a1.7 1.7 0 0 0-1.52 1.5Z",
  ],
  support: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    "M9.1 9a3 3 0 1 1 5 2.2c-1.1.8-2.1 1.3-2.1 2.8m0 4h.01",
  ],
};

export function DashboardIcon({
  name,
  className,
}: {
  name: DashboardIconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
