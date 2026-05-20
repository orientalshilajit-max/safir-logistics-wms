export type DashboardRoute = {
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  status: "Live" | "Setup" | "Draft";
};

export const dashboardRoutes: DashboardRoute[] = [
  {
    href: "/",
    label: "Dashboard",
    eyebrow: "Operations",
    title: "Warehouse Overview",
    description: "A command surface for prep center volume, exceptions, and client activity.",
    status: "Live",
  },
  {
    href: "/receiving-queue",
    label: "Receiving Queue",
    eyebrow: "Inbound",
    title: "Receiving Queue",
    description: "Track expected cartons, intake progress, and receiving exceptions.",
    status: "Setup",
  },
  {
    href: "/products",
    label: "Products",
    eyebrow: "Catalog",
    title: "Products",
    description: "Manage client product records, SKU identifiers, photos, and prep notes.",
    status: "Setup",
  },
  {
    href: "/inventory",
    label: "Inventory",
    eyebrow: "Stock",
    title: "Inventory",
    description: "Review SKU counts, storage states, and prep readiness across the warehouse.",
    status: "Setup",
  },
  {
    href: "/incoming-shipments",
    label: "Incoming Shipments",
    eyebrow: "Inbound",
    title: "Incoming Shipments",
    description: "Create inbound shipments with manually entered product lines and expected quantities.",
    status: "Setup",
  },
  {
    href: "/requests",
    label: "Requests",
    eyebrow: "Client Work",
    title: "Requests",
    description: "Organize client tasks for prep, labeling, bundling, relabeling, and special handling.",
    status: "Draft",
  },
  {
    href: "/outbound-shipments",
    label: "Outbound Shipments",
    eyebrow: "Outbound",
    title: "Outbound Shipments",
    description: "Coordinate shipment batches, carrier handoffs, and fulfillment milestones.",
    status: "Setup",
  },
  {
    href: "/invoices",
    label: "Invoices",
    eyebrow: "Billing",
    title: "Invoices",
    description: "Prepare a clean billing workspace for client services, storage, and shipment fees.",
    status: "Draft",
  },
  {
    href: "/clients",
    label: "Clients",
    eyebrow: "Accounts",
    title: "Clients",
    description: "Manage prep center client profiles, account health, and workspace ownership.",
    status: "Setup",
  },
  {
    href: "/services",
    label: "Services",
    eyebrow: "Catalog",
    title: "Services",
    description: "Structure the service catalog for prep actions, storage plans, and custom work.",
    status: "Setup",
  },
  {
    href: "/client-pricing-overrides",
    label: "Client Pricing",
    eyebrow: "Pricing",
    title: "Client Pricing Overrides",
    description: "Set client-specific service pricing that overrides catalog defaults.",
    status: "Setup",
  },
  {
    href: "/reports",
    label: "Reports",
    eyebrow: "Insights",
    title: "Reports",
    description: "Create a reporting surface for throughput, aging inventory, revenue, and SLA trends.",
    status: "Draft",
  },
  {
    href: "/settings",
    label: "Settings",
    eyebrow: "Workspace",
    title: "Settings",
    description: "Configure workspace preferences, team access, billing defaults, and WMS controls.",
    status: "Draft",
  },
];

export function getDashboardRoute(href: string) {
  const route = dashboardRoutes.find((item) => item.href === href);

  if (!route) {
    throw new Error(`Unknown dashboard route: ${href}`);
  }

  return route;
}
