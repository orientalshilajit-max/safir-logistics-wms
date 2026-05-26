"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products"> & {
  clients: Client | null;
};
type InventoryRow = Pick<
  Tables<"inventory">,
  "product_id" | "available_qty" | "reserved_qty" | "processing_qty" | "updated_at"
>;
type IncomingProductLine = Pick<
  Tables<"incoming_items">,
  | "inventory_posted_at"
  | "product_id"
  | "expected_quantity"
  | "received_quantity"
  | "is_unexpected"
  | "tracking_box_id"
> & {
  incoming_shipments: {
    number_of_boxes: number;
    statuses: Pick<Tables<"statuses">, "name"> | null;
  } | null;
};

export function ProductsClient() {
  const { role, clientId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [incomingLines, setIncomingLines] = useState<IncomingProductLine[]>([]);
  const [clientFilter, setClientFilter] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [asinQuery, setAsinQuery] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>();
    products.forEach((product) => {
      if (product.clients) {
        byId.set(product.clients.id, product.clients.company_name);
      }
    });

    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const productSearch = productQuery.trim().toLowerCase();
    const asinSearch = asinQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesClient = clientFilter === "all" || product.client_id === clientFilter;
      const matchesProduct =
        !productSearch ||
        product.product_name.toLowerCase().includes(productSearch) ||
        (product.sku ?? "").toLowerCase().includes(productSearch) ||
        (product.asin ?? "").toLowerCase().includes(productSearch) ||
        (product.barcode ?? "").toLowerCase().includes(productSearch);
      const matchesAsin = !asinSearch || (product.asin ?? "").toLowerCase().includes(asinSearch);

      return matchesClient && matchesProduct && matchesAsin;
    });
  }, [asinQuery, clientFilter, productQuery, products]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const productsQuery = supabase
      .from("products")
      .select("*, clients(id, company_name)")
      .is("deleted_at", null)
      .order("product_name");
    const inventoryQuery = supabase
      .from("inventory")
      .select("product_id, available_qty, reserved_qty, processing_qty, updated_at")
      .is("deleted_at", null);
    const incomingQuery = supabase
      .from("incoming_items")
      .select("inventory_posted_at, product_id, expected_quantity, received_quantity, is_unexpected, tracking_box_id, incoming_shipments!inner(number_of_boxes, statuses(name))")
      .is("deleted_at", null);

    if (isClientPortal && clientId) {
      productsQuery.eq("client_id", clientId);
      inventoryQuery.eq("client_id", clientId);
      incomingQuery.eq("incoming_shipments.client_id", clientId);
    }

    const [productsResult, inventoryResult, incomingResult] = await Promise.all([
      productsQuery,
      inventoryQuery,
      incomingQuery,
    ]);

    if (productsResult.error) {
      setError(productsResult.error.message);
    } else {
      setProducts((productsResult.data ?? []) as Product[]);
    }

    if (inventoryResult.error) {
      setError(inventoryResult.error.message);
    } else {
      setInventoryRows((inventoryResult.data ?? []) as InventoryRow[]);
    }

    if (incomingResult.error) {
      setError(incomingResult.error.message);
    } else {
      setIncomingLines((incomingResult.data ?? []) as IncomingProductLine[]);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  async function deleteProduct(product: Product) {
    if (!window.confirm("Delete this product?")) {
      return;
    }

    setError(null);
    const hasInventory = inventoryRows.some((row) => row.product_id === product.id);
    const hasShipmentHistory = incomingLines.some((line) => line.product_id === product.id);
    const payload = hasInventory || hasShipmentHistory
      ? { active: false }
      : { deleted_at: new Date().toISOString() };
    const { error: deleteError } = await supabase.from("products").update(payload).eq("id", product.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await loadData();
      if (hasInventory || hasShipmentHistory) {
        setError("This product has inventory or shipment history and cannot be deleted. Archive it instead.");
      }
    }
  }

  const displayProducts = useMemo(() => {
    return filteredProducts.filter((product) => {
      const matchesStatus =
        clientStatusFilter === "all" ||
        (clientStatusFilter === "active" && product.active) ||
        (clientStatusFilter === "inactive" && !product.active);

      return matchesStatus;
    });
  }, [clientStatusFilter, filteredProducts]);

  const clientProductStats = useMemo(() => {
    return products.reduce(
      (totals, product) => {
        const summary = getClientProductSummary(product, inventoryRows, incomingLines);

        totals.totalProducts += 1;
        if (product.active) totals.activeProducts += 1;
        totals.totalInStock += summary.inStock;
        totals.incomingUnits += summary.incomingUnits;

        return totals;
      },
      { totalProducts: 0, activeProducts: 0, totalInStock: 0, incomingUnits: 0 },
    );
  }, [incomingLines, inventoryRows, products]);
  const adminProductStats = useMemo(
    () =>
      products.reduce(
        (totals, product) => {
          const summary = getClientProductSummary(product, inventoryRows, incomingLines);
          totals.total += 1;
          if (product.active) totals.active += 1;
          totals.inStock += summary.inStock;
          totals.incoming += summary.incomingUnits;
          return totals;
        },
        { active: 0, incoming: 0, inStock: 0, total: 0 },
      ),
    [incomingLines, inventoryRows, products],
  );

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Products</h2>
            <p className="mt-1 text-sm text-slate-500">View and manage all your products.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/products/new"
              className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              <span className="mr-2 text-base leading-none">+</span>
              Add Product
            </Link>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <UploadIcon />
              Import
            </button>
          </div>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ProductStat icon={<PackageIcon />} tone="blue" label="Total Products" value={isClientPortal ? clientProductStats.totalProducts : adminProductStats.total} sublabel={isClientPortal ? "All time" : "All clients"} />
          <ProductStat icon={<ActiveBoxIcon />} tone="emerald" label="Active Products" value={isClientPortal ? clientProductStats.activeProducts : adminProductStats.active} sublabel="In stock or incoming" />
          <ProductStat icon={<TruckIcon />} tone="orange" label="Total In Stock" value={isClientPortal ? clientProductStats.totalInStock : adminProductStats.inStock} sublabel="Units" />
          <ProductStat icon={<DownloadIcon />} tone="violet" label="Incoming Units" value={isClientPortal ? clientProductStats.incomingUnits : adminProductStats.incoming} sublabel="Units on the way" />
        </section>
        <Panel title="Products">
          <div className="mb-4 space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                <div className="relative">
                  <SearchIcon />
                  <input
                    className={`${inputClassName} pl-9`}
                    placeholder="Search by product name, SKU, ASIN or UPC"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                  />
                </div>
                <select
                  className={inputClassName}
                  value={clientStatusFilter}
                  onChange={(event) => setClientStatusFilter(event.target.value)}
                >
                  <option value="all">Status: All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowMoreFilters((current) => !current)}
                >
                  <FilterIcon />
                  More Filters
                </button>
            </div>
            {showMoreFilters ? (
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3 lg:grid-cols-2">
                {isClientPortal ? null : (
                  <select
                    className={inputClassName}
                    value={clientFilter}
                    onChange={(event) => setClientFilter(event.target.value)}
                  >
                    <option value="all">All clients</option>
                    {clientOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className={inputClassName}
                  placeholder="Filter by ASIN"
                  value={asinQuery}
                  onChange={(event) => setAsinQuery(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          {loading ? (
            <LoadingState label="Loading products..." />
          ) : displayProducts.length === 0 ? (
            <EmptyState
              title="No products found"
              body="Add a product or adjust the filters."
              action={
                <Link
                  href="/products/new"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  + Add Product
                </Link>
              }
            />
          ) : (
            <div className="max-h-[44rem] overflow-auto rounded-md border border-slate-200">
              <ProductsTable
                products={displayProducts}
                inventoryRows={inventoryRows}
                incomingLines={incomingLines}
                isClientPortal={isClientPortal}
                onDeleteProduct={deleteProduct}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ProductsTable({
  products,
  inventoryRows,
  incomingLines,
  isClientPortal,
  onDeleteProduct,
}: {
  products: Product[];
  inventoryRows: InventoryRow[];
  incomingLines: IncomingProductLine[];
  isClientPortal: boolean;
  onDeleteProduct: (product: Product) => Promise<void>;
}) {
  return (
    <table className="w-full min-w-[1260px] text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs font-medium text-slate-500 backdrop-blur">
        <tr>
          <th className="w-10 px-4 py-3">
            <input type="checkbox" aria-label="Select all products" className="size-4 rounded border-slate-300" />
          </th>
          <th className="px-4 py-3 font-semibold">Product</th>
          <th className="px-4 py-3 font-semibold">SKU <SortMark /></th>
          <th className="px-4 py-3 font-semibold">ASIN / UPC <SortMark /></th>
          <th className="px-4 py-3 font-semibold">FNSKU <SortMark /></th>
          <th className="px-4 py-3 text-right font-semibold">In Stock (Units) <SortMark /></th>
          <th className="px-4 py-3 text-right font-semibold">Incoming (Units) <SortMark /></th>
          <th className="px-4 py-3 text-right font-semibold">Reserved (Units) <SortMark /></th>
          <th className="px-4 py-3 font-semibold">Last Updated <SortMark /></th>
          <th className="px-4 py-3 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {products.map((product) => {
          const summary = getClientProductSummary(product, inventoryRows, incomingLines);

          return (
            <tr key={product.id} className="cursor-pointer bg-white transition hover:bg-slate-50/80">
              <td className="px-4 py-2.5">
                <input type="checkbox" aria-label={`Select ${product.product_name}`} className="size-4 rounded border-slate-300" />
              </td>
              <td className="px-3 py-2.5 font-medium text-slate-950">
                <div className="flex items-center gap-3">
                  <ProductThumb product={product} />
                  <div>
                    <p className="font-medium text-slate-950">{product.product_name}</p>
                    {!isClientPortal && product.clients ? (
                      <p className="mt-0.5 text-xs text-slate-500">{product.clients.company_name}</p>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{product.sku ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-600">{product.asin ?? product.barcode ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-600">{product.fnsku ?? "-"}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatNumber(summary.inStock)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatNumber(summary.incomingUnits)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatNumber(summary.reservedUnits)}</td>
              <td className="px-3 py-2.5 text-slate-600">{formatDateTime(summary.lastUpdated ?? product.updated_at)}</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1.5">
                  <Link
                    href={`/products/${product.id}/edit`}
                    aria-label={`Edit ${product.product_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <PencilIcon />
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete ${product.product_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => void onDeleteProduct(product)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProductStat({
  icon,
  tone,
  label,
  value,
  sublabel,
}: {
  icon: ReactNode;
  tone: "blue" | "emerald" | "orange" | "violet";
  label: string;
  value: number;
  sublabel: string;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{formatNumber(value)}</p>
        <p className="mt-0.5 text-xs text-slate-500">{sublabel}</p>
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.photo_url) {
    return (
      <span
        className="block size-10 shrink-0 rounded-md border border-slate-200 bg-cover bg-center bg-slate-100"
        style={{ backgroundImage: `url("${product.photo_url}")` }}
      />
    );
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400">
      <PackageIcon />
    </span>
  );
}

function getClientProductSummary(
  product: Product,
  inventoryRows: InventoryRow[],
  incomingLines: IncomingProductLine[],
) {
  const productInventory = inventoryRows.filter((row) => row.product_id === product.id);
  const productIncoming = incomingLines.filter((line) => line.product_id === product.id);
  const availableQty = productInventory.reduce((sum, row) => sum + row.available_qty, 0);
  const reservedQty = productInventory.reduce((sum, row) => sum + row.reserved_qty, 0);
  const incomingQty = productIncoming
    .filter((line) => !line.inventory_posted_at)
    .reduce((sum, line) => sum + line.expected_quantity, 0);
  const lastUpdated = productInventory
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    incomingUnits: incomingQty,
    inStock: availableQty,
    lastUpdated,
    reservedUnits: reservedQty,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return (
    <span className="leading-tight">
      <span className="block">{day}</span>
      <span className="block text-xs text-slate-500">{time}</span>
    </span>
  );
}

function SortMark() {
  return <span className="ml-1 text-slate-300">↕</span>;
}

function SearchIcon() {
  return (
    <svg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
      <path d="m3.5 8.5 8.5 5 8.5-5" />
      <path d="M12 13.5V21" />
    </svg>
  );
}

function ActiveBoxIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21 16-9 5-9-5V8l9-5 9 5v8Z" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 5h14" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}
