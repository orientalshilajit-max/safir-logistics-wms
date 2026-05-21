"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import { ErrorBanner, PageHeader, Panel, StatusBadge } from "@/app/components/wms-ui";

type Overview = {
  clients: number;
  products: number;
  incomingShipments: number;
  inventoryAvailable: number;
  requests: number;
  invoices: number;
};

const initialOverview: Overview = {
  clients: 0,
  products: 0,
  incomingShipments: 0,
  inventoryAvailable: 0,
  requests: 0,
  invoices: 0,
};

export function DashboardOverviewClient() {
  const { role, clientId } = useAuth();
  const [overview, setOverview] = useState<Overview>(initialOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const loadOverview = useCallback(async () => {
    try {
      const clientsQuery = supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const productsQuery = supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const shipmentsQuery = supabase
        .from("incoming_shipments")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const inventoryQuery = supabase
        .from("inventory")
        .select("available_qty")
        .is("deleted_at", null);
      const requestsQuery = supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const invoicesQuery = supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);

      if (isClientPortal && clientId) {
        clientsQuery.eq("id", clientId);
        productsQuery.eq("client_id", clientId);
        shipmentsQuery.eq("client_id", clientId);
        inventoryQuery.eq("client_id", clientId);
        requestsQuery.eq("client_id", clientId);
        invoicesQuery.eq("client_id", clientId);
      }

      const [clients, products, incomingShipments, inventory, requests, invoices] = await Promise.all([
        clientsQuery,
        productsQuery,
        shipmentsQuery,
        inventoryQuery,
        requestsQuery,
        invoicesQuery,
      ]);

      const firstError =
        clients.error ??
        products.error ??
        incomingShipments.error ??
        inventory.error ??
        requests.error ??
        invoices.error;

      if (firstError) {
        console.error("Dashboard KPI fetch failed", firstError);
        setError(firstError.message);
        return;
      }

      setOverview({
        clients: clients.count ?? 0,
        products: products.count ?? 0,
        incomingShipments: incomingShipments.count ?? 0,
        inventoryAvailable:
          inventory.data?.reduce((total, row) => total + (row.available_qty ?? 0), 0) ?? 0,
        requests: requests.count ?? 0,
        invoices: invoices.count ?? 0,
      });
    } catch (fetchError) {
      console.error("Dashboard KPI fetch failed", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Dashboard KPI fetch failed.");
    } finally {
      setLoading(false);
    }
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOverview(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadOverview]);

  if (isClientPortal) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Client Portal"
          title="My Dashboard"
          description="A simplified view of your inventory, inbound shipments, prep requests, invoices, and notifications."
          action={<StatusBadge tone="emerald">Client access</StatusBadge>}
        />
        <ErrorBanner message={error} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Available Units" value={overview.inventoryAvailable} loading={loading} />
          <Metric label="My Incoming" value={overview.incomingShipments} loading={loading} />
          <Metric label="My Requests" value={overview.requests} loading={loading} />
          <Metric label="My Invoices" value={overview.invoices} loading={loading} />
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
      <PageHeader
        eyebrow="Operations"
        title="Warehouse Overview"
        description="A live command surface for prep center clients, inbound work, receiving, and available stock."
        action={<StatusBadge tone="emerald">Connected to Supabase</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Clients" value={overview.clients} loading={loading} />
        <Metric label="Products" value={overview.products} loading={loading} />
        <Metric
          label="Incoming Shipments"
          value={overview.incomingShipments}
          loading={loading}
        />
        <Metric
          label="Inventory"
          value={overview.inventoryAvailable}
          loading={loading}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <PlaceholderMetric label="Requests" />
        <PlaceholderMetric label="Invoices" />
        <PlaceholderMetric label="Revenue" />
      </section>

      <Panel
        title="Phase 1 workspace"
        description="Requests, invoices, billing, and payments are intentionally not wired yet."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <WorkflowStep title="1. Add clients" body="Create client accounts before catalog and inbound work." />
          <WorkflowStep title="2. Add products" body="Attach product records to clients with SKU/FNSKU/ASIN details." />
          <WorkflowStep title="3. Receive inventory" body="Create incoming shipments, receive items, and post to inventory." />
        </div>
      </Panel>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  placeholder,
}: {
  label: string;
  value: number;
  loading: boolean;
  placeholder?: string;
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
          {placeholder ?? value}
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

function PlaceholderMetric({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <StatusBadge>Placeholder</StatusBadge>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-400">--</p>
    </div>
  );
}

function WorkflowStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}
