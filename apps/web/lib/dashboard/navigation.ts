export type DashboardIconName =
  | "overview"
  | "websites"
  | "audits"
  | "issues"
  | "reports"
  | "compare"
  | "schedule"
  | "leads"
  | "clients"
  | "team"
  | "billing"
  | "notifications"
  | "settings"
  | "support";

export type DashboardNavigationItem = {
  label: string;
  href: string;
  icon: DashboardIconName;
  description: string;
  section?: string;
  adminOnly?: boolean;
};

export type DashboardNavigationGroup = {
  label: string;
  items: readonly DashboardNavigationItem[];
};

export const dashboardNavigation: readonly DashboardNavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: "overview",
        description: "Workspace status and getting started",
      },
      {
        label: "Websites",
        href: "/dashboard/websites",
        icon: "websites",
        section: "websites",
        description: "Manage websites connected to this workspace",
      },
      {
        label: "Audits",
        href: "/dashboard/audits",
        icon: "audits",
        section: "audits",
        description: "Review current and previous website audits",
      },
      {
        label: "Issues",
        href: "/dashboard/issues",
        icon: "issues",
        section: "issues",
        description: "Prioritize findings across audited websites",
      },
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: "reports",
        section: "reports",
        description: "Create and manage client-ready reports",
      },
      {
        label: "Compare",
        href: "/dashboard/compare",
        icon: "compare",
        section: "compare",
        description: "Compare audit results over time",
      },
      {
        label: "Scheduled Audits",
        href: "/dashboard/scheduled-audits",
        icon: "schedule",
        section: "scheduled-audits",
        description: "Configure recurring website audits",
      },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        label: "Clients",
        href: "/dashboard/clients",
        icon: "clients",
        section: "clients",
        description: "Organize websites and reports by client",
      },
      {
        label: "Team",
        href: "/dashboard/team",
        icon: "team",
        section: "team",
        description: "Manage workspace members and invitations",
      },
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: "billing",
        section: "billing",
        description: "Manage plans, subscription, and usage",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Leads",
        href: "/dashboard/leads",
        icon: "leads",
        section: "leads",
        description: "Review private service requests from public audits",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        icon: "notifications",
        section: "notifications",
        description: "Review workspace and audit notifications",
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: "settings",
        section: "settings",
        description: "Configure your account and workspace",
      },
      {
        label: "Support",
        href: "/dashboard/support",
        icon: "support",
        section: "support",
        description: "Find help and contact support",
      },
    ],
  },
] as const;

export const dashboardItems = dashboardNavigation.flatMap(
  (group) => group.items,
);

export function getDashboardItemByPath(
  pathname: string,
): DashboardNavigationItem | undefined {
  return dashboardItems
    .filter(
      (item) =>
        item.href === pathname ||
        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)),
    )
    .sort((first, second) => second.href.length - first.href.length)[0];
}

export function getDashboardItemBySection(
  section: string,
): DashboardNavigationItem | undefined {
  return dashboardItems.find((item) => item.section === section);
}
