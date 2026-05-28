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
    href: "/clients",
    label: "Clients",
    eyebrow: "Accounts",
    title: "Clients",
    description: "Manage prep center client profiles, account health, and workspace ownership.",
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
    href: "/incoming-shipments",
    label: "Incoming Shipments",
    eyebrow: "Inbound",
    title: "Incoming Shipments",
    description: "Create inbound shipments with manually entered product lines and expected quantities.",
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
    href: "/requests",
    label: "Requests",
    eyebrow: "Client Work",
    title: "Requests",
    description: "Organize client tasks for prep, labeling, bundling, relabeling, and special handling.",
    status: "Live",
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
    description: "A simplified view of your products, inbound shipments, service requests, files, and invoices.",
    status: "Live",
  },
  {
    href: "/products",
    label: "Products",
    eyebrow: "Products",
    title: "Products",
    description: "Review product movement from in transit through available stock.",
    status: "Live",
  },
  {
    href: "/incoming-shipments",
    label: "Incoming Shipments",
    eyebrow: "Inbound",
    title: "Incoming Shipments",
    description: "Track inbound shipments, boxes, tracking numbers, and receiving status.",
    status: "Live",
  },
  {
    href: "/requests",
    label: "Service Requests",
    eyebrow: "Client Work",
    title: "Service Requests",
    description: "Create and monitor prep, labeling, packing, and special handling requests.",
    status: "Live",
  },
  {
    href: "/documents",
    label: "Files & Documents",
    eyebrow: "Files",
    title: "Files & Documents",
    description: "Upload and review files shared with your prep center account.",
    status: "Live",
  },
  {
    href: "/invoices",
    label: "Invoices",
    eyebrow: "Billing",
    title: "Invoices",
    description: "Review generated invoices and payment status.",
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
