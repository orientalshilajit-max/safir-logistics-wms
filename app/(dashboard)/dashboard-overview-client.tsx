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

export function DashboardOverviewClient() {
  const { role, clientId } = useAuth();
  const [overview, setOverview] = useState<Overview>(initialOverview);
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
    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Available Units" value={overview.inventoryAvailable} loading={loading} />
          <Metric label="My Incoming" value={overview.incomingShipments.inTransit + overview.incomingShipments.arrived + overview.incomingShipments.received + overview.incomingShipments.issue} loading={loading} />
          <Metric label="My Requests" value={overview.requests.new + overview.requests.inProcess + overview.requests.completed} loading={loading} />
          <Metric label="My Invoices" value={overview.invoices.open + overview.invoices.paidThisMonth} loading={loading} />
        </section>

        <Panel
          title="Client workspace"
          description="Jump into the areas available to your account."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PortalLink href="/inventory" title="My Inventory" body="Check available, reserved, processing, shipped, and damaged units." />
            <PortalLink href="/incoming-shipments" title="My Incoming Shipments" body="Track inbound shipments and receiving progress." />
            <PortalLink href="/requests" title="My Requests" body="Create prep requests and follow approval or work status." />
            <PortalLink href="/invoices" title="My Invoices" body="Review invoices, due dates, and payment status." />
          </div>
        </Panel>

        <Panel title="Notifications" description="Use the notification button in the top bar for recent updates.">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-600">
            Shipment updates, request approvals, discrepancies, and invoice notices appear in the notification menu.
          </div>
        </Panel>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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

function PortalLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
    >
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </Link>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
