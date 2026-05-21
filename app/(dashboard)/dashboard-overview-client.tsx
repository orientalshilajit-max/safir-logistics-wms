"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { ErrorBanner, PageHeader, Panel, StatusBadge } from "@/app/components/wms-ui";

type Overview = {
  clients: number;
  products: number;
  incomingShipments: number;
  inventoryAvailable: number;
};

const initialOverview: Overview = {
  clients: 0,
  products: 0,
  incomingShipments: 0,
  inventoryAvailable: 0,
};

export function DashboardOverviewClient() {
  const [overview, setOverview] = useState<Overview>(initialOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOverview() {
    try {
      const [clients, products, incomingShipments, inventory] = await Promise.all([
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabase
          .from("incoming_shipments")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabase.from("inventory").select("available_qty"),
      ]);

      const firstError = clients.error ?? products.error ?? incomingShipments.error ?? inventory.error;

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
      });
    } catch (fetchError) {
      console.error("Dashboard KPI fetch failed", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Dashboard KPI fetch failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOverview(), 0);

    return () => window.clearTimeout(timeout);
  }, []);

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
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <StatusBadge tone="emerald">Live</StatusBadge>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
        {loading ? "..." : value}
      </p>
    </div>
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
