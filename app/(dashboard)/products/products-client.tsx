"use client";

import Link from "next/link";
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
  StatusBadge,
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
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
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
    if (!window.confirm(`Delete ${product.product_name}?`)) {
      return;
    }

    setError(null);
    const { error: deleteError } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", product.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await loadData();
    }
  }

  const clientFilteredProducts = useMemo(() => {
    if (!isClientPortal) return filteredProducts;

    return filteredProducts.filter((product) => {
      const summary = getClientProductSummary(product, inventoryRows, incomingLines);
      const matchesStatus = clientStatusFilter === "all" || summary.status === clientStatusFilter;
      const matchesStock =
        stockStatusFilter === "all" ||
        (stockStatusFilter === "in_stock" && summary.inStock > 0) ||
        (stockStatusFilter === "incoming" && summary.incomingUnits > 0) ||
        (stockStatusFilter === "reserved" && summary.reservedUnits > 0);

      return matchesStatus && matchesStock;
    });
  }, [clientStatusFilter, filteredProducts, incomingLines, inventoryRows, isClientPortal, stockStatusFilter]);

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

  if (isClientPortal) {
    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Products</h2>
          <Link
            href="/products/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Product
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ClientStat label="Total Products" value={clientProductStats.totalProducts} sublabel="All time" />
          <ClientStat label="Active Products" value={clientProductStats.activeProducts} sublabel="In stock or incoming" />
          <ClientStat label="Total In Stock" value={clientProductStats.totalInStock} sublabel="Units" />
          <ClientStat label="Incoming Units" value={clientProductStats.incomingUnits} sublabel="Units on the way" />
        </section>

        <Panel title="Products">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <input
              className={inputClassName}
              placeholder="Search by product name, SKU, ASIN or UPC"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={clientStatusFilter}
              onChange={(event) => setClientStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="Available">Available</option>
              <option value="Receiving">Receiving</option>
              <option value="In Transit">In Transit</option>
              <option value="Issue">Issue</option>
            </select>
            <select
              className={inputClassName}
              value={stockStatusFilter}
              onChange={(event) => setStockStatusFilter(event.target.value)}
            >
              <option value="all">All stock</option>
              <option value="in_stock">In stock</option>
              <option value="incoming">Incoming</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading products..." />
          ) : clientFilteredProducts.length === 0 ? (
            <EmptyState
              title="No products found"
              body="Add a product or adjust the filters."
              action={
                <Link
                  href="/products/new"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  + Add Product
                </Link>
              }
            />
          ) : (
            <div className="max-h-[42rem] overflow-auto">
              <ClientProductsTable
                products={clientFilteredProducts}
                inventoryRows={inventoryRows}
                incomingLines={incomingLines}
              />
            </div>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Products</h2>
          <Link
            href="/products/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Product
          </Link>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ClientStat label="Total Products" value={adminProductStats.total} sublabel="All clients" />
          <ClientStat label="Active Products" value={adminProductStats.active} sublabel="In stock or incoming" />
          <ClientStat label="Total In Stock" value={adminProductStats.inStock} sublabel="Units" />
          <ClientStat label="Incoming Units" value={adminProductStats.incoming} sublabel="Units on the way" />
        </section>
        <Panel title={isClientPortal ? "My Products" : "Product catalog"}>
          {isClientPortal ? null : (
            <div className="mb-4 grid gap-3 lg:grid-cols-3">
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
              <input
                className={inputClassName}
                placeholder="Filter by product or SKU"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
              />
              <input
                className={inputClassName}
                placeholder="Filter by ASIN"
                value={asinQuery}
                onChange={(event) => setAsinQuery(event.target.value)}
              />
            </div>
          )}
          {loading ? (
            <LoadingState label="Loading products..." />
          ) : filteredProducts.length === 0 ? (
            <EmptyState title="No products yet" body="Create product records so incoming shipments can reference them." />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              {isClientPortal ? (
                <ClientProductsTable
                  products={filteredProducts}
                  inventoryRows={inventoryRows}
                  incomingLines={incomingLines}
                />
              ) : (
              <table className="w-full min-w-[980px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">FNSKU</th>
                    <th className="px-4 py-3 font-semibold">ASIN</th>
                    <th className="px-4 py-3 font-semibold">Barcode</th>
                    <th className="px-4 py-3 font-semibold">State</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-950">
                        <div className="flex items-center gap-3">
                          <ProductThumb product={product} />
                          <span>{product.product_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{product.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{product.sku ?? "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{product.fnsku ?? "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{product.asin ?? "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{product.barcode ?? "-"}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={product.active ? "emerald" : "slate"}>
                          {product.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <Link
                            href={`/products/${product.id}/edit`}
                            aria-label={`Edit ${product.product_name}`}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                          >
                            E
                          </Link>
                          <Button type="button" variant="danger" className="size-8 px-0" onClick={() => void deleteProduct(product)}>
                            D
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ClientProductsTable({
  products,
  inventoryRows,
  incomingLines,
}: {
  products: Product[];
  inventoryRows: InventoryRow[];
  incomingLines: IncomingProductLine[];
}) {
  return (
    <table className="w-full min-w-[1080px] text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
        <tr>
          <th className="px-4 py-3 font-semibold">Product</th>
          <th className="px-4 py-3 font-semibold">SKU</th>
          <th className="px-4 py-3 font-semibold">ASIN / UPC</th>
          <th className="px-4 py-3 font-semibold">In Stock Units</th>
          <th className="px-4 py-3 font-semibold">Incoming Units</th>
          <th className="px-4 py-3 font-semibold">Reserved Units</th>
          <th className="px-4 py-3 font-semibold">Last Updated</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          <th className="px-4 py-3 font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {products.map((product) => {
          const summary = getClientProductSummary(product, inventoryRows, incomingLines);

          return (
            <tr key={product.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 font-medium text-slate-950">
                <div className="flex items-center gap-3">
                  <ProductThumb product={product} />
                  <span>{product.product_name}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{product.sku ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-600">{product.asin ?? product.barcode ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-600">{summary.inStock}</td>
              <td className="px-3 py-2.5 text-slate-600">{summary.incomingUnits}</td>
              <td className="px-3 py-2.5 text-slate-600">{summary.reservedUnits}</td>
              <td className="px-3 py-2.5 text-slate-600">{formatDate(summary.lastUpdated ?? product.updated_at)}</td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={clientProductStatusTone(summary.status)}>{summary.status}</StatusBadge>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex gap-1.5">
                  <Link
                    href={`/products/${product.id}/edit`}
                    aria-label={`Edit ${product.product_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  >
                    E
                  </Link>
                  <Link
                    href={`/incoming-shipments?status=${summary.status === "Issue" ? "issue" : "all"}`}
                    aria-label={`View ${product.product_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                  >
                    V
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ClientStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.photo_url) {
    return (
      <span
        className="block size-9 shrink-0 rounded-md border border-slate-200 bg-cover bg-center bg-slate-100"
        style={{ backgroundImage: `url("${product.photo_url}")` }}
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
      {product.product_name.slice(0, 2).toUpperCase()}
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
  const boxes = productIncoming.reduce((sum, line) => {
    return sum + (line.incoming_shipments?.number_of_boxes ?? 0);
  }, 0);
  const status = getClientProductStatus(availableQty, productIncoming);
  const lastUpdated = productInventory
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    boxes,
    incomingUnits: incomingQty,
    inStock: availableQty,
    lastUpdated,
    reservedUnits: reservedQty,
    status,
  };
}

function getClientProductStatus(
  availableQty: number,
  incomingLines: IncomingProductLine[],
) {
  if (
    incomingLines.some(
      (line) =>
        line.is_unexpected ||
        (line.inventory_posted_at && line.expected_quantity !== line.received_quantity) ||
        line.incoming_shipments?.statuses?.name === "Issue" ||
        line.incoming_shipments?.statuses?.name === "Received with Discrepancy",
    )
  ) {
    return "Issue";
  }

  if (availableQty > 0) {
    return "Available";
  }

  if (
    incomingLines.some((line) =>
      ["Arrived at Prep", "Pending Receiving", "Partially Received"].includes(
        line.incoming_shipments?.statuses?.name ?? "",
      ),
    )
  ) {
    return "Receiving";
  }

  return "In Transit";
}

function clientProductStatusTone(status: string) {
  if (status === "Available") return "emerald";
  if (status === "Receiving") return "orange";
  if (status === "Issue") return "rose";
  return "blue";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
