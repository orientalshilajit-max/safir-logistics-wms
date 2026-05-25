"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import { ErrorBanner, inputClassName, Panel, StatusBadge } from "@/app/components/wms-ui";

type Overview = {
  clients: {
    active: number;
    pending: number;
    inactive: number;
  };
  incomingShipments: {
    inTransit: number;
    arrived: number;
    received: number;
    issue: number;
  };
  inventoryAvailable: number;
  requests: {
    new: number;
    inProcess: number;
    completed: number;
  };
  invoices: {
    open: number;
    overdue: number;
    paidThisMonth: number;
  };
  revenue: number;
};

const initialOverview: Overview = {
  clients: {
    active: 0,
    pending: 0,
    inactive: 0,
  },
  incomingShipments: {
    inTransit: 0,
    arrived: 0,
    received: 0,
    issue: 0,
  },
  inventoryAvailable: 0,
  requests: {
    new: 0,
    inProcess: 0,
    completed: 0,
  },
  invoices: {
    open: 0,
    overdue: 0,
    paidThisMonth: 0,
  },
  revenue: 0,
};

type DateRange = "today" | "week" | "month" | "year";
type ClientShipment = {
  id: string;
  created_at: string;
  number_of_boxes: number;
  tracking_numbers: string[];
  statuses: { name: string } | null;
  incoming_items: {
    expected_quantity: number;
    products: { product_name: string } | null;
  }[];
};
type ClientInventoryRow = {
  id: string;
  available_qty: number;
  reserved_qty: number;
  processing_qty: number;
  products: { product_name: string; sku: string | null } | null;
};
type ClientActivity = {
  id: string;
  action: string;
  created_at: string;
  metadata: unknown;
};

export function DashboardOverviewClient() {
  const { role, clientId } = useAuth();
  const [overview, setOverview] = useState<Overview>(initialOverview);
  const [clientShipments, setClientShipments] = useState<ClientShipment[]>([]);
  const [clientInventory, setClientInventory] = useState<ClientInventoryRow[]>([]);
  const [clientActivity, setClientActivity] = useState<ClientActivity[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";
  const dateWindow = useMemo(() => getDateWindow(dateRange), [dateRange]);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const clientsQuery = supabase
        .from("clients")
        .select("id, status, login_status, created_at")
        .is("deleted_at", null);
      const shipmentsQuery = supabase
        .from("incoming_shipments")
        .select("id, created_at, statuses(name)")
        .is("deleted_at", null);
      const inventoryQuery = supabase
        .from("inventory")
        .select("available_qty")
        .is("deleted_at", null);
      const requestsQuery = supabase
        .from("service_requests")
        .select("id, status, created_at")
        .is("deleted_at", null);
      const invoicesQuery = supabase
        .from("invoices")
        .select("id, status, total_amount, paid_amount, created_at, issue_date, due_date")
        .is("deleted_at", null);

      if (isClientPortal && clientId) {
        clientsQuery.eq("id", clientId);
        shipmentsQuery.eq("client_id", clientId);
        inventoryQuery.eq("client_id", clientId);
        requestsQuery.eq("client_id", clientId);
        invoicesQuery.eq("client_id", clientId);
      }

      const [clients, incomingShipments, inventory, requests, invoices] = await Promise.all([
        clientsQuery,
        shipmentsQuery,
        inventoryQuery,
        requestsQuery,
        invoicesQuery,
      ]);

      const firstError =
        clients.error ??
        incomingShipments.error ??
        inventory.error ??
        requests.error ??
        invoices.error;

      if (firstError) {
        console.error("Dashboard KPI fetch failed", firstError);
        setError(firstError.message);
        return;
      }

      const datedShipments = (incomingShipments.data ?? []).filter((shipment) =>
        isWithinRange(shipment.created_at, dateWindow),
      );
      const datedRequests = (requests.data ?? []).filter((request) =>
        isWithinRange(request.created_at, dateWindow),
      );
      const datedInvoices = (invoices.data ?? []).filter((invoice) =>
        isWithinRange(invoice.created_at, dateWindow),
      );
      const monthWindow = getDateWindow("month");

      setOverview({
        clients: countClients(clients.data ?? []),
        incomingShipments: countShipments(datedShipments),
        inventoryAvailable:
          inventory.data?.reduce((total, row) => total + (row.available_qty ?? 0), 0) ?? 0,
        requests: countRequests(datedRequests),
        invoices: countInvoices(invoices.data ?? [], monthWindow),
        revenue: datedInvoices
          .filter((invoice) => invoice.status === "Paid")
          .reduce((total, invoice) => total + Number(invoice.paid_amount ?? invoice.total_amount ?? 0), 0),
      });

      if (isClientPortal && clientId) {
        const [shipmentDetails, inventoryDetails, activityDetails] = await Promise.all([
          supabase
            .from("incoming_shipments")
            .select("id, created_at, number_of_boxes, tracking_numbers, statuses(name), incoming_items(expected_quantity, products(product_name))")
            .eq("client_id", clientId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("inventory")
            .select("id, available_qty, reserved_qty, processing_qty, products!inventory_product_id_fkey(product_name, sku)")
            .eq("client_id", clientId)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .limit(5),
          supabase
            .from("activity_logs")
            .select("id, action, created_at, metadata")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const detailError = shipmentDetails.error ?? inventoryDetails.error ?? activityDetails.error;

        if (detailError) {
          console.error("Client dashboard detail fetch failed", detailError);
        } else {
          setClientShipments((shipmentDetails.data ?? []) as ClientShipment[]);
          setClientInventory((inventoryDetails.data ?? []) as ClientInventoryRow[]);
          setClientActivity((activityDetails.data ?? []) as ClientActivity[]);
        }
      }
    } catch (fetchError) {
      console.error("Dashboard KPI fetch failed", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Dashboard KPI fetch failed.");
    } finally {
      setLoading(false);
    }
  }, [clientId, dateWindow, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOverview(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadOverview]);

  if (isClientPortal) {
    const incomingCount =
      overview.incomingShipments.inTransit +
      overview.incomingShipments.arrived +
      overview.incomingShipments.issue;
    const pendingServices = overview.requests.new + overview.requests.inProcess;
    const storageBoxes = clientShipments.reduce((sum, shipment) => sum + shipment.number_of_boxes, 0);

    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <PortalMetric label="In Stock" value={overview.inventoryAvailable} sublabel="Units" loading={loading} />
          <PortalMetric label="Incoming Shipments" value={incomingCount} sublabel="Active" loading={loading} />
          <PortalMetric label="Pending Services" value={pendingServices} sublabel="Orders" loading={loading} />
          <PortalMetric label="Unpaid Invoices" value={overview.invoices.open} sublabel="Outstanding" loading={loading} />
          <PortalMetric label="Storage Usage" value={storageBoxes} sublabel="Boxes" loading={loading} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.85fr)]">
          <Panel title="Incoming Shipments">
            <ClientShipmentsTable shipments={clientShipments} loading={loading} />
          </Panel>

          <Panel title="Recent Activity">
            <ClientActivityList activity={clientActivity} loading={loading} />
          </Panel>

          <Panel title="Top Inventory Snapshot">
            <ClientInventoryTable rows={clientInventory} loading={loading} />
          </Panel>

          <Panel title="Quick Actions">
            <div className="grid gap-3 sm:grid-cols-2">
              <PortalAction href="/incoming-shipments/new" title="Create Incoming Shipment" />
              <PortalAction href="/requests/new" title="Request Service" />
              <PortalAction href="/products/new" title="Add Product" />
              <PortalAction href="/documents/new" title="Upload Files" />
            </div>
          </Panel>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="flex justify-end">
        <select
          className={`${inputClassName} w-full sm:w-44`}
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value as DateRange)}
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <CompactBlock
          title="Clients"
          loading={loading}
          items={[
            ["Active", overview.clients.active, "emerald"],
            ["Pending", overview.clients.pending, "amber"],
            ["Inactive", overview.clients.inactive, "slate"],
          ]}
        />
        <CompactBlock
          title="Incoming Shipments"
          loading={loading}
          items={[
            ["In Transit", overview.incomingShipments.inTransit, "blue"],
            ["Arrived at Prep", overview.incomingShipments.arrived, "orange"],
            ["Received", overview.incomingShipments.received, "emerald"],
            ["Issue", overview.incomingShipments.issue, "rose"],
          ]}
        />
        <CompactBlock
          title="Requests"
          loading={loading}
          items={[
            ["New", overview.requests.new, "blue"],
            ["In Process", overview.requests.inProcess, "amber"],
            ["Completed", overview.requests.completed, "emerald"],
          ]}
        />
        <CompactBlock
          title="Invoices"
          loading={loading}
          items={[
            ["Open", overview.invoices.open, "blue"],
            ["Overdue", overview.invoices.overdue, "rose"],
            ["Paid This Month", overview.invoices.paidThisMonth, "emerald"],
          ]}
        />
        <div className="xl:col-span-2">
          <Metric label="Revenue" value={overview.revenue} loading={loading} money />
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  placeholder,
  money,
}: {
  label: string;
  value: number;
  loading: boolean;
  placeholder?: string;
  money?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <StatusBadge tone="emerald">Live</StatusBadge>
      </div>
      {loading ? (
        <div className="mt-5 h-9 w-24 animate-pulse rounded-md bg-slate-100" />
      ) : (
        <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
          {placeholder ?? (money ? formatMoney(value) : value)}
        </p>
      )}
    </div>
  );
}

function PortalMetric({
  label,
  value,
  sublabel,
  loading,
}: {
  label: string;
  value: number;
  sublabel: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {loading ? (
        <div className="mt-4 h-8 w-20 animate-pulse rounded-md bg-slate-100" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
    </div>
  );
}

function PortalAction({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 items-center rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-950 transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
    >
      <span className="mr-3 flex size-9 items-center justify-center rounded-full bg-blue-50 text-base text-blue-700">
        +
      </span>
      {title}
    </Link>
  );
}

function ClientShipmentsTable({
  shipments,
  loading,
}: {
  shipments: ClientShipment[];
  loading: boolean;
}) {
  if (loading) return <div className="h-28 animate-pulse rounded-md bg-slate-100" />;
  if (shipments.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">No incoming shipments yet.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3 font-semibold">Shipment ID</th>
            <th className="px-3 py-3 font-semibold">Products</th>
            <th className="px-3 py-3 font-semibold">Boxes</th>
            <th className="px-3 py-3 font-semibold">Units</th>
            <th className="px-3 py-3 font-semibold">Created Date</th>
            <th className="px-3 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shipments.map((shipment) => (
            <tr key={shipment.id} className="hover:bg-slate-50">
              <td className="px-3 py-3 font-medium text-blue-700">{shipment.id.slice(0, 8)}</td>
              <td className="px-3 py-3 text-slate-600">{shipment.incoming_items.length}</td>
              <td className="px-3 py-3 text-slate-600">{shipment.number_of_boxes}</td>
              <td className="px-3 py-3 text-slate-600">
                {shipment.incoming_items.reduce((sum, item) => sum + item.expected_quantity, 0)}
              </td>
              <td className="px-3 py-3 text-slate-600">{formatShortDate(shipment.created_at)}</td>
              <td className="px-3 py-3">
                <StatusBadge tone={shipmentStatusTone(shipment.statuses?.name ?? "In Transit")}>
                  {shipment.statuses?.name ?? "In Transit"}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientActivityList({
  activity,
  loading,
}: {
  activity: ClientActivity[];
  loading: boolean;
}) {
  if (loading) return <div className="h-28 animate-pulse rounded-md bg-slate-100" />;
  if (activity.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">No recent activity yet.</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {activity.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
          <span className="font-medium text-slate-700">{sentenceCase(item.action)}</span>
          <span className="shrink-0 text-xs text-slate-500">{formatShortDate(item.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function ClientInventoryTable({
  rows,
  loading,
}: {
  rows: ClientInventoryRow[];
  loading: boolean;
}) {
  if (loading) return <div className="h-28 animate-pulse rounded-md bg-slate-100" />;
  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">Received inventory will appear here.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[640px] text-left text-sm tabular-nums">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3 font-semibold">Product</th>
            <th className="px-3 py-3 font-semibold">SKU</th>
            <th className="px-3 py-3 font-semibold">In Stock</th>
            <th className="px-3 py-3 font-semibold">Reserved</th>
            <th className="px-3 py-3 font-semibold">Available</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-3 py-3 font-medium text-slate-950">{row.products?.product_name ?? "Unknown product"}</td>
              <td className="px-3 py-3 text-slate-600">{row.products?.sku ?? "-"}</td>
              <td className="px-3 py-3 text-slate-600">{row.available_qty + row.reserved_qty + row.processing_qty}</td>
              <td className="px-3 py-3 text-slate-600">{row.reserved_qty}</td>
              <td className="px-3 py-3 font-semibold text-emerald-700">{row.available_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactBlock({
  title,
  items,
  loading,
}: {
  title: string;
  items: [string, number, "slate" | "emerald" | "blue" | "amber" | "rose" | "orange"][];
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map(([label, value, tone]) => (
          <div key={label} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <StatusBadge tone={tone}>{label}</StatusBadge>
            {loading ? (
              <div className="mt-4 h-7 w-16 animate-pulse rounded-md bg-slate-200" />
            ) : (
              <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
                {value}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function shipmentStatusTone(status: string) {
  if (status === "Received") return "emerald";
  if (status === "Issue" || status === "Received with Discrepancy") return "rose";
  if (status === "Arrived at Prep" || status === "Pending Receiving") return "orange";
  return "blue";
}

function sentenceCase(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function countClients(
  clients: { status: string; login_status: string | null }[],
) {
  return clients.reduce(
    (counts, client) => {
      const status = normalizeClientStatus(client.status, client.login_status);
      counts[status] += 1;
      return counts;
    },
    { active: 0, pending: 0, inactive: 0 },
  );
}

function normalizeClientStatus(status: string, loginStatus: string | null) {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "active" as const;
  if (normalized === "inactive") return "inactive" as const;
  if (loginStatus === "no login") return "pending" as const;
  return "pending" as const;
}

function countShipments(
  shipments: { statuses: { name: string } | null }[],
) {
  return shipments.reduce(
    (counts, shipment) => {
      const status = normalizeShipmentStatus(shipment.statuses?.name ?? "In Transit");
      counts[status] += 1;
      return counts;
    },
    { inTransit: 0, arrived: 0, received: 0, issue: 0 },
  );
}

function normalizeShipmentStatus(status: string) {
  if (status === "Received") return "received" as const;
  if (status === "Issue" || status === "Received with Discrepancy") return "issue" as const;
  if (status === "Arrived at Prep" || status === "Pending Receiving" || status === "Partially Received") {
    return "arrived" as const;
  }
  return "inTransit" as const;
}

function countRequests(requests: { status: string }[]) {
  return requests.reduce(
    (counts, request) => {
      const status = normalizeRequestBucket(request.status);
      counts[status] += 1;
      return counts;
    },
    { new: 0, inProcess: 0, completed: 0 },
  );
}

function normalizeRequestBucket(status: string) {
  if (status === "Submitted" || status === "Pending Approval") return "new" as const;
  if (status === "Completed" || status === "Shipped") return "completed" as const;
  if (
    [
      "Approved",
      "In Progress",
      "Waiting Labels",
      "Labels Uploaded",
      "Ready to Pack",
      "Ready for Prep",
      "Prep in Progress",
      "QC Check",
      "Packing",
      "Ready to Ship",
    ].includes(status)
  ) {
    return "inProcess" as const;
  }
  return "new" as const;
}

function countInvoices(
  invoices: { status: string; created_at: string }[],
  monthWindow: { start: Date; end: Date },
) {
  return invoices.reduce(
    (counts, invoice) => {
      if (["Unpaid", "Partial Paid", "Overdue", "Sent"].includes(invoice.status)) {
        counts.open += 1;
      }
      if (invoice.status === "Overdue") {
        counts.overdue += 1;
      }
      if (invoice.status === "Paid" && isWithinRange(invoice.created_at, monthWindow)) {
        counts.paidThisMonth += 1;
      }
      return counts;
    },
    { open: 0, overdue: 0, paidThisMonth: 0 },
  );
}

function getDateWindow(range: DateRange) {
  const now = new Date();
  const start = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end: now };
}

function isWithinRange(value: string, window: { start: Date; end: Date }) {
  const date = new Date(value);
  return date >= window.start && date <= window.end;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}
