"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  QuickFilterButton,
  StatusBadge,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku" | "fnsku" | "asin">;
type InventoryRow = Tables<"inventory"> & {
  clients: Client | null;
  products: Product | null;
};

export function InventoryClient() {
  const { role, clientId } = useAuth();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "reserved" | "damaged">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      rows.reduce(
        (accumulator, row) => ({
          expected: accumulator.expected + row.expected_qty,
          received: accumulator.received + row.received_qty,
          available: accumulator.available + row.available_qty,
          damaged: accumulator.damaged + row.damaged_qty,
        }),
        { expected: 0, received: 0, available: 0, damaged: 0 },
      ),
    [rows],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (stockFilter === "available") return row.available_qty > 0;
        if (stockFilter === "reserved") return row.reserved_qty > 0;
        if (stockFilter === "damaged") return row.damaged_qty > 0;
        return true;
      }),
    [rows, stockFilter],
  );

  const isClientPortal = role === "client";

  const loadInventory = useCallback(async () => {
    const query = supabase
      .from("inventory")
      .select("*, clients(id, company_name), products!inventory_product_id_fkey(id, product_name, sku, fnsku, asin)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (isClientPortal && clientId) {
      query.eq("client_id", clientId);
    }

    const { data, error: loadError } = await query;

    if (loadError) {
      setError(loadError.message);
    } else {
      setRows((data ?? []) as InventoryRow[]);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInventory(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadInventory]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Stock"
        title={isClientPortal ? "My Inventory" : "Inventory"}
        description={
          isClientPortal
            ? "Your current inventory balances across available, reserved, processing, shipped, and damaged units."
            : "Live inventory balances created from completed receiving activity."
        }
        action={<StatusBadge tone="emerald">{totals.available} available</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Expected" value={totals.expected} />
        <Metric label="Received" value={totals.received} />
        <Metric label="Available" value={totals.available} />
        <Metric label="Damaged" value={totals.damaged} />
      </section>

      <Panel title="Inventory balances" description="Grouped by client and product.">
        <div className="mb-4 flex flex-wrap gap-2">
          <QuickFilterButton active={stockFilter === "all"} onClick={() => setStockFilter("all")}>
            All
          </QuickFilterButton>
          <QuickFilterButton active={stockFilter === "available"} onClick={() => setStockFilter("available")}>
            Available
          </QuickFilterButton>
          <QuickFilterButton active={stockFilter === "reserved"} onClick={() => setStockFilter("reserved")}>
            Reserved
          </QuickFilterButton>
          <QuickFilterButton active={stockFilter === "damaged"} onClick={() => setStockFilter("damaged")}>
            Damaged
          </QuickFilterButton>
        </div>
        {loading ? (
          <LoadingState label="Loading inventory..." />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No inventory rows match this view"
            body={
              isClientPortal
                ? "No inventory is visible for this filter yet. Try another view or check back after receiving is complete."
                : "Try another quick filter or complete receiving to create inventory records."
            }
          />
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Expected</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Available</th>
                  <th className="px-4 py-3 font-semibold">Reserved</th>
                  <th className="px-4 py-3 font-semibold">Processing</th>
                  <th className="px-4 py-3 font-semibold">Shipped</th>
                  <th className="px-4 py-3 font-semibold">Damaged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {row.products?.product_name ?? "Unknown product"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.clients?.company_name ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.products?.sku ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.expected_qty}</td>
                    <td className="px-4 py-3 text-slate-600">{row.received_qty}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{row.available_qty}</td>
                    <td className="px-4 py-3 text-slate-600">{row.reserved_qty}</td>
                    <td className="px-4 py-3 text-slate-600">{row.processing_qty}</td>
                    <td className="px-4 py-3 text-slate-600">{row.shipped_qty}</td>
                    <td className="px-4 py-3 text-slate-600">{row.damaged_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}
