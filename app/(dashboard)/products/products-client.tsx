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
type InventoryRow = Pick<Tables<"inventory">, "product_id" | "available_qty">;
type IncomingProductLine = Pick<
  Tables<"incoming_items">,
  "product_id" | "expected_quantity" | "received_quantity" | "is_unexpected" | "tracking_box_id"
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
        (product.sku ?? "").toLowerCase().includes(productSearch);
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
      .select("product_id, available_qty")
      .is("deleted_at", null);
    const incomingQuery = supabase
      .from("incoming_items")
      .select("product_id, expected_quantity, received_quantity, is_unexpected, tracking_box_id, incoming_shipments!inner(number_of_boxes, statuses(name))")
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

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge tone="blue">{filteredProducts.length} products</StatusBadge>
          <Link
            href="/products/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Product
          </Link>
        </div>
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
                      <td className="px-4 py-3 font-medium text-slate-950">{product.product_name}</td>
                      <td className="px-4 py-3 text-slate-600">{product.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{product.sku ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{product.fnsku ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{product.asin ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{product.barcode ?? "-"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={product.active ? "emerald" : "slate"}>
                          {product.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Edit
                          </Link>
                          <Button type="button" variant="danger" onClick={() => void deleteProduct(product)}>
                            Delete
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
    <table className="w-full min-w-[860px] text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
        <tr>
          <th className="px-4 py-3 font-semibold">Product Name</th>
          <th className="px-4 py-3 font-semibold">Quantity of Items</th>
          <th className="px-4 py-3 font-semibold">Quantity of Boxes</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          <th className="px-4 py-3 font-semibold">Notes</th>
          <th className="px-4 py-3 font-semibold">Date Added</th>
          <th className="px-4 py-3 font-semibold">Action/View</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {products.map((product) => {
          const summary = getClientProductSummary(product, inventoryRows, incomingLines);

          return (
            <tr key={product.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-950">{product.product_name}</td>
              <td className="px-4 py-3 text-slate-600">{summary.items}</td>
              <td className="px-4 py-3 text-slate-600">{summary.boxes}</td>
              <td className="px-4 py-3">
                <StatusBadge tone={clientProductStatusTone(summary.status)}>{summary.status}</StatusBadge>
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-600">{product.notes ?? "-"}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(product.created_at)}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/incoming-shipments?status=${summary.status === "Issue" ? "issue" : "all"}`}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const expectedQty = productIncoming.reduce((sum, line) => sum + line.expected_quantity, 0);
  const boxes = new Set(
    productIncoming
      .map((line) => line.tracking_box_id)
      .filter(Boolean),
  ).size;
  const status = getClientProductStatus(availableQty, productIncoming);

  return {
    boxes: boxes || productIncoming.reduce((sum, line) => sum + (line.incoming_shipments?.number_of_boxes ?? 0), 0),
    items: availableQty || expectedQty,
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
