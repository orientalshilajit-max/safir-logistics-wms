"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function ProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [clientFilter, setClientFilter] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [asinQuery, setAsinQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const productsResult = await supabase
      .from("products")
      .select("*, clients(id, company_name)")
      .is("deleted_at", null)
      .order("product_name");

    if (productsResult.error) {
      setError(productsResult.error.message);
    } else {
      setProducts((productsResult.data ?? []) as Product[]);
    }

    setLoading(false);
  }, []);

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
        <Panel title="Product catalog">
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
          {loading ? (
            <LoadingState label="Loading products..." />
          ) : filteredProducts.length === 0 ? (
            <EmptyState title="No products yet" body="Create product records so incoming shipments can reference them." />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
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
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
