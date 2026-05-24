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
    href: "/warehouse-tasks",
    label: "Warehouse Tasks",
    eyebrow: "Operations",
    title: "Warehouse Task Queue",
    description: "Run picking, packing, QC, and ready-to-ship workflows from one fast queue.",
    status: "Setup",
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
    href: "/documents",
    label: "Documents & Files",
    eyebrow: "Files",
    title: "Documents & Files",
    description: "Manage client agreements, product images, supplier invoices, compliance files, and general attachments.",
    status: "Setup",
  },
  {
    href: "/invoices",
    label: "Invoices",
    eyebrow: "Billing",
    title: "Invoices",
    description: "Prepare a clean billing workspace for client services, storage, and shipment fees.",
    status: "Setup",
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

export const clientPortalRoutes: DashboardRoute[] = [
  {
    href: "/",
    label: "Dashboard",
    eyebrow: "Client Portal",
    title: "My Dashboard",
    description: "A simplified view of your inventory, inbound shipments, service requests, and invoices.",
    status: "Live",
  },
  {
    href: "/inventory",
    label: "My Inventory",
    eyebrow: "Stock",
    title: "My Inventory",
    description: "Review available, reserved, processing, shipped, and damaged inventory balances.",
    status: "Live",
  },
  {
    href: "/incoming-shipments",
    label: "My Incoming Shipments",
    eyebrow: "Inbound",
    title: "My Incoming Shipments",
    description: "Track inbound shipments, boxes, tracking numbers, and receiving status.",
    status: "Live",
  },
  {
    href: "/requests",
    label: "My Requests",
    eyebrow: "Client Work",
    title: "My Requests",
    description: "Create and monitor prep, labeling, packing, and special handling requests.",
    status: "Live",
  },
  {
    href: "/invoices",
    label: "My Invoices",
    eyebrow: "Billing",
    title: "My Invoices",
    description: "Review generated invoices and payment status.",
    status: "Live",
  },
  {
    href: "/documents",
    label: "Documents & Files",
    eyebrow: "Files",
    title: "Documents & Files",
    description: "Upload and review files shared with your prep center account.",
    status: "Live",
  },
];

export function getDashboardRoute(href: string) {
  const route = dashboardRoutes.find((item) => item.href === href);

  if (!route) {
    throw new Error(`Unknown dashboard route: ${href}`);
  }

  return route;
}
