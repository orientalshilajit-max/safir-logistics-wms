"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { CLIENT_ACCOUNT_LINK_ERROR } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
  QuickFilterButton,
} from "@/app/components/wms-ui";
import { SlidersIcon, TableActionButton } from "@/app/components/table-actions";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku" | "fnsku" | "asin" | "barcode" | "photo_url" | "sort_order">;
type InventoryRow = Tables<"inventory"> & {
  clients: Client | null;
  products: Product | null;
};
type InventoryEditForm = {
  available_qty: string;
  damaged_qty: string;
  incoming_qty: string;
  received_qty: string;
  shipped_qty: string;
};
type AdminSortOption = "product_order" | "newest" | "oldest" | "customer_az" | "customer_za" | "quantity_high" | "quantity_low";

export function InventoryClient() {
  const { role, clientId } = useAuth();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<InventoryEditForm>({
    available_qty: "0",
    damaged_qty: "0",
    incoming_qty: "0",
    received_qty: "0",
    shipped_qty: "0",
  });
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "damaged">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [adminSort, setAdminSort] = useState<AdminSortOption>("product_order");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      rows.reduce(
        (accumulator, row) => ({
          incoming: accumulator.incoming + getIncomingUnits(row),
          available: accumulator.available + row.available_qty,
          damaged: accumulator.damaged + row.damaged_qty,
        }),
        { incoming: 0, available: 0, damaged: 0 },
      ),
    [rows],
  );
  const clientCountWithInventory = useMemo(
    () => new Set(rows.map((row) => row.client_id)).size,
    [rows],
  );
  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) => {
          const normalized = searchQuery.trim().toLowerCase();
          const productName = row.products?.product_name ?? "";
          const sku = row.products?.sku ?? "";
          const asin = row.products?.asin ?? "";
          const barcode = row.products?.barcode ?? "";
          const clientName = row.clients?.company_name ?? "";
          const matchesSearch =
            !normalized ||
            productName.toLowerCase().includes(normalized) ||
            sku.toLowerCase().includes(normalized) ||
            asin.toLowerCase().includes(normalized) ||
            barcode.toLowerCase().includes(normalized) ||
            clientName.toLowerCase().includes(normalized);
          if (stockFilter === "available") return row.available_qty > 0 && matchesSearch;
          if (stockFilter === "damaged") return row.damaged_qty > 0 && matchesSearch;
          return matchesSearch;
        })
        .sort((left, right) => compareInventoryRows(left, right, adminSort)),
    [adminSort, rows, searchQuery, stockFilter],
  );

  const isClientPortal = role === "client";
  const isAdmin = role === "admin";
  const clientFilteredRows = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    return rows
      .filter((row) => {
        const productName = row.products?.product_name ?? "";
        const sku = row.products?.sku ?? "";
        const asin = row.products?.asin ?? "";
        const barcode = row.products?.barcode ?? "";
        const matchesSearch =
          !normalized ||
          productName.toLowerCase().includes(normalized) ||
          sku.toLowerCase().includes(normalized) ||
          asin.toLowerCase().includes(normalized) ||
          barcode.toLowerCase().includes(normalized);
        const matchesProduct = productFilter === "all" || row.product_id === productFilter;
        const matchesStock =
          stockFilter === "all" ||
          (stockFilter === "available" && row.available_qty > 0) ||
          (stockFilter === "damaged" && row.damaged_qty > 0);

        return matchesSearch && matchesProduct && matchesStock;
      })
      .sort(compareInventoryRowsByProductOrder);
  }, [productFilter, rows, searchQuery, stockFilter]);
  const productOptions = useMemo(
    () =>
      rows
        .map((row) => ({
          id: row.product_id,
          name: row.products?.product_name ?? "Unknown product",
          sortOrder: row.products?.sort_order ?? 0,
        }))
        .filter((item, index, list) => list.findIndex((option) => option.id === item.id) === index)
        .sort((a, b) => {
          const orderDifference = a.sortOrder - b.sortOrder;
          if (orderDifference !== 0) return orderDifference;
          return a.name.localeCompare(b.name);
        }),
    [rows],
  );
  const unresolvedProductRows = useMemo(
    () => rows.filter((row) => !row.products),
    [rows],
  );

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isClientPortal && !clientId) {
      setRows([]);
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setLoading(false);
      return;
    }

    const query = supabase
      .from("inventory")
      .select("*, clients(id, company_name), products!inventory_product_id_fkey(id, product_name, sku, fnsku, asin, barcode, photo_url, sort_order)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (isClientPortal) {
      query.eq("client_id", clientId as string);
    }

    const { data, error: loadError } = await query;

    if (loadError) {
      setError(loadError.message);
    } else {
      setError(null);
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
      damaged_qty: String(row.damaged_qty),
      incoming_qty: String(getIncomingUnits(row)),
      received_qty: String(row.received_qty),
      shipped_qty: String(row.shipped_qty),
    });
  }

  async function saveInventory(row: InventoryRow) {
    if (savingId) {
      return;
    }

    const next = {
      available_qty: Number(editForm.available_qty),
      damaged_qty: Number(editForm.damaged_qty),
      incoming_qty: Number(editForm.incoming_qty),
      received_qty: Number(editForm.received_qty),
      shipped_qty: Number(editForm.shipped_qty),
    };

    if (Object.values(next).some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Inventory quantities must be zero or greater.");
      return;
    }

    const receivedDelta = next.received_qty - row.received_qty;
    const shippedDelta = next.shipped_qty - row.shipped_qty;

    setSavingId(row.id);
    setError(null);
    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        available_qty: Math.max(0, next.available_qty + receivedDelta - shippedDelta),
        damaged_qty: next.damaged_qty,
        expected_qty: next.received_qty + next.incoming_qty,
        received_qty: next.received_qty,
        shipped_qty: next.shipped_qty,
      })
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingId(null);
      await loadInventory();
    }

    setSavingId(null);
  }

  if (isClientPortal) {
    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Inventory</h2>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Total Units in Stock / Available Units" value={totals.available} />
          <Metric label="Incoming Units" value={totals.incoming} />
          <Metric label="Damaged Units" value={totals.damaged} />
        </section>

        <Panel title="Inventory">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_14rem]">
            <input
              className={inputClassName}
              placeholder="Search by product name, SKU, ASIN"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}
            >
              <option value="all">All stock</option>
              <option value="available">Available</option>
              <option value="damaged">Damaged</option>
            </select>
            <select
              className={inputClassName}
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
            >
              <option value="all">All products</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading inventory..." />
          ) : clientFilteredRows.length === 0 ? (
            <EmptyState title="No inventory found" body="Received inventory will appear here." />
          ) : (
            <div className="max-h-[42rem] overflow-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">ASIN / UPC</th>
                    <th className="px-4 py-3 font-semibold">Incoming Units</th>
                    <th className="px-4 py-3 font-semibold">Damaged Units</th>
                    <th className="px-4 py-3 font-semibold">Available Units</th>
                    <th className="px-4 py-3 font-semibold">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientFilteredRows.map((row) => {
                    const incoming = getIncomingUnits(row);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium text-slate-950">
                          <div className="flex items-center gap-3">
                            <InventoryThumb product={row.products} />
                            <span>{row.products?.product_name ?? "Unknown product"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{row.products?.sku ?? "-"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{row.products?.asin ?? row.products?.barcode ?? "-"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{incoming}</td>
                        <td className="px-3 py-2.5 text-slate-600">{row.damaged_qty}</td>
                        <td className="px-3 py-2.5 font-semibold text-emerald-700">{row.available_qty}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatDate(row.updated_at)}</td>
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

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />
      {isAdmin && unresolvedProductRows.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {unresolvedProductRows.length} inventory row{unresolvedProductRows.length === 1 ? "" : "s"} could not resolve a product catalog record. Inventory data was not changed.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Inventory</h2>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Available Units" value={totals.available} />
        <Metric label="Incoming Units" value={totals.incoming} />
        <Metric label="Damaged Units" value={totals.damaged} />
        <Metric label="Total Clients with Inventory" value={clientCountWithInventory} />
      </section>

      <Panel title="Inventory balances">
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem_auto]">
          <input
            className={inputClassName}
            placeholder="Search product, SKU, ASIN, customer"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Sort by
            <select className={inputClassName} value={adminSort} onChange={(event) => setAdminSort(event.target.value as AdminSortOption)}>
              <option value="product_order">Manual product order</option>
              <option value="newest">Date: Newest first</option>
              <option value="oldest">Date: Oldest first</option>
              <option value="customer_az">Customer: A-Z</option>
              <option value="customer_za">Customer: Z-A</option>
              <option value="quantity_high">Quantity: Highest available first</option>
              <option value="quantity_low">Quantity: Lowest available first</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
          <QuickFilterButton active={stockFilter === "all"} onClick={() => setStockFilter("all")}>
            All
          </QuickFilterButton>
          <QuickFilterButton active={stockFilter === "available"} onClick={() => setStockFilter("available")}>
            Available
          </QuickFilterButton>
          <QuickFilterButton active={stockFilter === "damaged"} onClick={() => setStockFilter("damaged")}>
            Damaged
          </QuickFilterButton>
          </div>
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
            <table className="w-full min-w-[920px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">ASIN / UPC</th>
                  <th className="px-4 py-3 font-semibold">Incoming Units</th>
                  <th className="px-4 py-3 font-semibold">Damaged Units</th>
                  <th className="px-4 py-3 font-semibold">Available Units</th>
                  {isAdmin ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        <div className="flex items-center gap-3">
                          <InventoryThumb product={row.products} />
                          <span>{row.products?.product_name ?? "Unknown product"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.products?.sku ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.products?.asin ?? row.products?.barcode ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{getIncomingUnits(row)}</td>
                      <td className="px-4 py-3 text-slate-600">{row.damaged_qty}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{row.available_qty}</td>
                      {isAdmin ? (
                        <td className="px-4 py-3">
                          <TableActionButton
                            aria-label={`Edit stock for ${row.products?.product_name ?? "inventory row"}`}
                            title="Edit Stock"
                            onClick={() => startEditing(row)}
                          >
                            <SlidersIcon />
                          </TableActionButton>
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
      {isAdmin && editingId ? (
        <InventoryEditDialog
          form={editForm}
          row={rows.find((row) => row.id === editingId) ?? null}
          saving={savingId === editingId}
          setForm={setEditForm}
          onCancel={() => setEditingId(null)}
          onSave={(row) => void saveInventory(row)}
        />
      ) : null}
    </div>
  );
}

function InventoryEditDialog({
  form,
  onCancel,
  onSave,
  row,
  saving,
  setForm,
}: {
  form: InventoryEditForm;
  onCancel: () => void;
  onSave: (row: InventoryRow) => void;
  row: InventoryRow | null;
  saving: boolean;
  setForm: (form: InventoryEditForm) => void;
}) {
  if (!row) return null;

  const productName = row.products?.product_name ?? "Unknown product";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">Edit Inventory</h3>
          <p className="mt-1 text-sm text-slate-500">{productName} - {row.clients?.company_name ?? "Unknown client"}</p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Available Units">
            <input
              className={inputClassName}
              min="0"
              type="number"
              value={form.available_qty}
              onChange={(event) => setForm({ ...form, available_qty: event.target.value })}
            />
          </Field>
          <Field label="Incoming Units">
            <input
              className={inputClassName}
              min="0"
              type="number"
              value={form.incoming_qty}
              onChange={(event) => setForm({ ...form, incoming_qty: event.target.value })}
            />
          </Field>
          <Field label="Damaged Units">
            <input
              className={inputClassName}
              min="0"
              type="number"
              value={form.damaged_qty}
              onChange={(event) => setForm({ ...form, damaged_qty: event.target.value })}
            />
          </Field>
          <Field label="Received Units">
            <input
              className={inputClassName}
              min="0"
              type="number"
              value={form.received_qty}
              onChange={(event) => setForm({ ...form, received_qty: event.target.value })}
            />
          </Field>
          <Field label="Shipped Units">
            <input
              className={inputClassName}
              min="0"
              type="number"
              value={form.shipped_qty}
              onChange={(event) => setForm({ ...form, shipped_qty: event.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => onSave(row)}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function getIncomingUnits(row: InventoryRow) {
  return Math.max(row.expected_qty - row.received_qty, 0);
}

function compareInventoryRows(left: InventoryRow, right: InventoryRow, sort: AdminSortOption) {
  if (sort === "product_order") {
    return compareInventoryRowsByProductOrder(left, right);
  }

  if (sort === "oldest") {
    return new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
  }

  if (sort === "customer_az" || sort === "customer_za") {
    const difference = (left.clients?.company_name ?? "").localeCompare(right.clients?.company_name ?? "");
    return sort === "customer_az" ? difference : -difference;
  }

  if (sort === "quantity_high" || sort === "quantity_low") {
    const difference = right.available_qty - left.available_qty;
    return sort === "quantity_high" ? difference : -difference;
  }

  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

function compareInventoryRowsByProductOrder(left: InventoryRow, right: InventoryRow) {
  const clientDifference = (left.clients?.company_name ?? "").localeCompare(right.clients?.company_name ?? "");
  if (clientDifference !== 0) return clientDifference;

  const orderDifference = (left.products?.sort_order ?? 0) - (right.products?.sort_order ?? 0);
  if (orderDifference !== 0) return orderDifference;

  return (left.products?.product_name ?? "").localeCompare(right.products?.product_name ?? "");
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function InventoryThumb({ product }: { product: Product | null }) {
  if (product?.photo_url) {
    return (
      <span
        className="block size-9 shrink-0 rounded-md border border-slate-200 bg-cover bg-center bg-slate-100"
        style={{ backgroundImage: `url("${product.photo_url}")` }}
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
      {(product?.product_name ?? "??").slice(0, 2).toUpperCase()}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
