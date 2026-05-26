"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import { EmptyState, ErrorBanner, inputClassName, LoadingState, Panel, StatusBadge } from "@/app/components/wms-ui";
import { PencilIcon, TableActionButton, TableActionLink, TrashIcon } from "@/app/components/table-actions";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products"> & {
  clients: Client | null;
};
type ProductHistoryRow = {
  product_id: string;
};

type StatusFilter = "active" | "archived" | "all";
type DateFilter = "all" | "today" | "week" | "month" | "year";

export function ProductsClient() {
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const isAdmin = role === "admin";
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<ProductHistoryRow[]>([]);
  const [incomingHistory, setIncomingHistory] = useState<ProductHistoryRow[]>([]);
  const [requestHistory, setRequestHistory] = useState<ProductHistoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let productsQuery = supabase
      .from("products")
      .select("*, clients(id, company_name)")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    let inventoryQuery = supabase
      .from("inventory")
      .select("product_id")
      .is("deleted_at", null);

    let incomingQuery = supabase
      .from("incoming_items")
      .select("product_id, incoming_shipments!inner(client_id)")
      .is("deleted_at", null);

    let requestQuery = supabase
      .from("request_items")
      .select("product_id, service_requests!inner(client_id)")
      .is("deleted_at", null);

    if (isClientPortal && clientId) {
      productsQuery = productsQuery.eq("client_id", clientId);
      inventoryQuery = inventoryQuery.eq("client_id", clientId);
      incomingQuery = incomingQuery.eq("incoming_shipments.client_id", clientId);
      requestQuery = requestQuery.eq("service_requests.client_id", clientId);
    }

    const [productsResult, clientsResult, inventoryResult, incomingResult, requestResult] = await Promise.all([
      productsQuery,
      isAdmin
        ? supabase
            .from("clients")
            .select("id, company_name")
            .is("deleted_at", null)
            .order("company_name")
        : Promise.resolve({ data: [], error: null }),
      inventoryQuery,
      incomingQuery,
      requestQuery,
    ]);

    if (productsResult.error) setError(productsResult.error.message);
    if (clientsResult.error) setError(clientsResult.error.message);
    if (inventoryResult.error) setError(inventoryResult.error.message);
    if (incomingResult.error) setError(incomingResult.error.message);
    if (requestResult.error) setError(requestResult.error.message);

    setProducts((productsResult.data ?? []) as Product[]);
    setClients((clientsResult.data ?? []) as Client[]);
    setInventoryHistory((inventoryResult.data ?? []) as ProductHistoryRow[]);
    setIncomingHistory((incomingResult.data ?? []) as ProductHistoryRow[]);
    setRequestHistory((requestResult.data ?? []) as ProductHistoryRow[]);
    setLoading(false);
  }, [clientId, isAdmin, isClientPortal]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      await Promise.resolve();
      if (active) {
        await loadData();
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [loadData]);

  const historyProductIds = useMemo(() => {
    return new Set([
      ...inventoryHistory.map((row) => row.product_id),
      ...incomingHistory.map((row) => row.product_id),
      ...requestHistory.map((row) => row.product_id),
    ]);
  }, [incomingHistory, inventoryHistory, requestHistory]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return products
      .filter((product) => {
        const matchesSearch =
          !normalized ||
          product.product_name.toLowerCase().includes(normalized) ||
          product.sku?.toLowerCase().includes(normalized) ||
          product.asin?.toLowerCase().includes(normalized) ||
          product.barcode?.toLowerCase().includes(normalized) ||
          product.fnsku?.toLowerCase().includes(normalized);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && product.active) ||
          (statusFilter === "archived" && !product.active);
        const matchesClient = !isAdmin || clientFilter === "all" || product.client_id === clientFilter;
        const matchesDate = dateFilter === "all" || isWithinDateFilter(product.updated_at ?? product.created_at, dateFilter);

        return matchesSearch && matchesStatus && matchesClient && matchesDate;
      })
      .sort(compareProductsForDisplay);
  }, [clientFilter, dateFilter, isAdmin, products, query, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: products.length,
      active: products.filter((product) => product.active).length,
      archived: products.filter((product) => !product.active).length,
    };
  }, [products]);

  async function handleArchiveDelete(product: Product) {
    setError(null);
    setSuccess(null);

    if (!product.active) {
      const shouldRestore = window.confirm("Restore this product?");
      if (!shouldRestore) return;

      const { error: restoreError } = await supabase.from("products").update({ active: true }).eq("id", product.id);

      if (restoreError) {
        setError(restoreError.message);
        return;
      }

      setSuccess("Product restored.");
      await loadData();
      return;
    }

    if (historyProductIds.has(product.id)) {
      window.alert("This product has history and cannot be deleted.");
      const shouldArchive = window.confirm("Archive this product instead?");
      if (!shouldArchive) return;

      const { error: archiveError } = await supabase.from("products").update({ active: false }).eq("id", product.id);

      if (archiveError) {
        setError(archiveError.message);
        return;
      }

      setSuccess("Product archived.");
      await loadData();
      return;
    }

    const shouldDelete = window.confirm("Delete this product?");
    if (!shouldDelete) return;

    const { error: deleteError } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", product.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setSuccess("Product deleted.");
    await loadData();
  }

  if (loading) {
    return <LoadingState label="Loading products..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">Products</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage all your products.</p>
        </div>
        <Link
          href="/products/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <PlusIcon />
          Add Product
        </Link>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="grid gap-3 md:grid-cols-3">
        <ProductStat icon={<CatalogIcon />} label="Total Products" helper="Catalog records" value={stats.total} />
        <ProductStat icon={<ActiveIcon />} label="Active Products" helper="Included in active selectors" value={stats.active} />
        <ProductStat icon={<ArchiveIcon />} label="Archived Products" helper="Hidden from normal selectors" value={stats.archived} />
      </div>

      <Panel title="Product Catalog">
        <div className={isAdmin ? "grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_10rem_10rem]" : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]"}>
          {isAdmin ? (
            <select className={inputClassName} value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="all">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </select>
          ) : null}
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              className={`${inputClassName} pl-9`}
              placeholder="Search by product name, SKU, ASIN or UPC"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select className={inputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All Products</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          {isAdmin ? (
            <select className={inputClassName} value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          ) : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[0.68rem] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[7%] px-3 py-2 font-semibold">Image</th>
                <th className="w-[31%] px-2 py-2 font-semibold">Product Name</th>
                <th className="w-[11%] px-2 py-2 font-semibold">SKU</th>
                <th className="w-[13%] px-2 py-2 font-semibold">ASIN / UPC</th>
                <th className="w-[11%] px-2 py-2 font-semibold">FNSKU</th>
                <th className="w-[9%] px-2 py-2 font-semibold">Status</th>
                <th className="w-[10%] px-2 py-2 font-semibold">Last Updated</th>
                <th className="w-[8%] px-2 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="transition hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <ProductThumb product={product} />
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-950">{product.product_name}</p>
                    {isAdmin ? <p className="mt-0.5 truncate text-xs text-slate-500">{product.clients?.company_name ?? "Unknown client"}</p> : null}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-600">{product.sku ?? "-"}</td>
                  <td className="px-2 py-2.5 text-xs text-slate-600">{formatAsinUpc(product)}</td>
                  <td className="px-2 py-2.5 text-xs text-slate-600">{product.fnsku ?? "-"}</td>
                  <td className="px-2 py-2.5">
                    <StatusBadge tone={product.active ? "emerald" : "slate"}>{product.active ? "Active" : "Archived"}</StatusBadge>
                  </td>
                  <td className="px-2 py-2.5 text-xs leading-4 text-slate-500">{formatCompactDate(product.updated_at)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <TableActionLink
                        href={`/products/${product.id}/edit`}
                        title="Edit product"
                        aria-label={`Edit ${product.product_name}`}
                      >
                        <PencilIcon />
                      </TableActionLink>
                      <TableActionButton
                        title={product.active && !historyProductIds.has(product.id) ? "Delete product" : product.active ? "Archive product" : "Restore product"}
                        aria-label={product.active && !historyProductIds.has(product.id) ? `Delete ${product.product_name}` : product.active ? `Archive ${product.product_name}` : `Restore ${product.product_name}`}
                        tone={product.active && !historyProductIds.has(product.id) ? "danger" : "neutral"}
                        onClick={() => void handleArchiveDelete(product)}
                      >
                        {product.active && !historyProductIds.has(product.id) ? <TrashIcon /> : <ArchiveIcon />}
                      </TableActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No products found"
              body="Add a catalog product or adjust the filters."
              action={
                <Link
                  href="/products/new"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Add Product
                </Link>
              }
            />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function ProductStat({ helper, icon, label, value }: { helper: string; icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{formatNumber(value)}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">{icon}</span>
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.photo_url) {
    return (
      <span
        className="block size-10 shrink-0 rounded-md border border-slate-200 bg-slate-100 bg-cover bg-center"
        style={{ backgroundImage: `url("${product.photo_url}")` }}
      />
    );
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
      {(product.product_name || "P").slice(0, 2).toUpperCase()}
    </span>
  );
}

function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
      {message}
    </div>
  );
}

function compareProductsForDisplay(left: Product, right: Product) {
  const orderDifference = (left.sort_order ?? 0) - (right.sort_order ?? 0);
  if (orderDifference !== 0) return orderDifference;

  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function isWithinDateFilter(value: string, filter: DateFilter) {
  const date = new Date(value);
  const now = new Date();

  if (filter === "today") {
    return date.toDateString() === now.toDateString();
  }

  if (filter === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return date >= start;
  }

  if (filter === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (filter === "year") {
    return date.getFullYear() === now.getFullYear();
  }

  return true;
}

function formatAsinUpc(product: Product) {
  const values = [product.asin, product.barcode].filter(Boolean);
  return values.length > 0 ? values.join(" / ") : "-";
}

function formatCompactDate(value: string) {
  const date = new Date(value);

  return (
    <>
      {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}
      <br />
      {new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date)}
    </>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16v13H4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 7 6 3h12l2 4M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}

function ActiveIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
