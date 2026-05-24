"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
  QuickFilterButton,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    available_qty: "0",
    reserved_qty: "0",
    processing_qty: "0",
    damaged_qty: "0",
  });
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
  const isAdmin = role === "admin";

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

  function startEditing(row: InventoryRow) {
    setEditingId(row.id);
    setEditForm({
      available_qty: String(row.available_qty),
      reserved_qty: String(row.reserved_qty),
      processing_qty: String(row.processing_qty),
      damaged_qty: String(row.damaged_qty),
    });
  }

  async function saveInventory(row: InventoryRow) {
    if (savingId) {
      return;
    }

    const next = {
      available_qty: Number(editForm.available_qty),
      reserved_qty: Number(editForm.reserved_qty),
      processing_qty: Number(editForm.processing_qty),
      damaged_qty: Number(editForm.damaged_qty),
    };

    if (Object.values(next).some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Inventory quantities must be zero or greater.");
      return;
    }

    setSavingId(row.id);
    setError(null);
    const { error: updateError } = await supabase
      .from("inventory")
      .update(next)
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingId(null);
      await loadInventory();
    }

    setSavingId(null);
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Expected" value={totals.expected} />
        <Metric label="Received" value={totals.received} />
        <Metric label="Available" value={totals.available} />
        <Metric label="Damaged" value={totals.damaged} />
      </section>

      <Panel title="Inventory balances">
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
                  {isAdmin ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isEditing = editingId === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {row.products?.product_name ?? "Unknown product"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.products?.sku ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.expected_qty}</td>
                      <td className="px-4 py-3 text-slate-600">{row.received_qty}</td>
                      <EditableQty editing={isEditing} field="available_qty" form={editForm} setForm={setEditForm} value={row.available_qty} />
                      <EditableQty editing={isEditing} field="reserved_qty" form={editForm} setForm={setEditForm} value={row.reserved_qty} />
                      <EditableQty editing={isEditing} field="processing_qty" form={editForm} setForm={setEditForm} value={row.processing_qty} />
                      <td className="px-4 py-3 text-slate-600">{row.shipped_qty}</td>
                      <EditableQty editing={isEditing} field="damaged_qty" form={editForm} setForm={setEditForm} value={row.damaged_qty} />
                      {isAdmin ? (
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Button type="button" disabled={savingId === row.id} onClick={() => void saveInventory(row)}>
                                {savingId === row.id ? "Saving..." : "Save"}
                              </Button>
                              <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button type="button" variant="secondary" onClick={() => startEditing(row)}>
                              Edit
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function EditableQty({
  editing,
  field,
  form,
  setForm,
  value,
}: {
  editing: boolean;
  field: "available_qty" | "reserved_qty" | "processing_qty" | "damaged_qty";
  form: Record<"available_qty" | "reserved_qty" | "processing_qty" | "damaged_qty", string>;
  setForm: (form: Record<"available_qty" | "reserved_qty" | "processing_qty" | "damaged_qty", string>) => void;
  value: number;
}) {
  if (!editing) {
    return <td className="px-4 py-3 text-slate-600">{value}</td>;
  }

  return (
    <td className="px-4 py-3">
      <input
        className={`${inputClassName} w-24`}
        min="0"
        type="number"
        value={form[field]}
        onChange={(event) => setForm({ ...form, [field]: event.target.value })}
      />
    </td>
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
