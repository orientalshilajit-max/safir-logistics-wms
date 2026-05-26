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
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products"> & {
  clients: Client | null;
};
type InventoryRow = Pick<
  Tables<"inventory">,
  | "id"
  | "client_id"
  | "product_id"
  | "expected_qty"
  | "received_qty"
  | "available_qty"
  | "reserved_qty"
  | "processing_qty"
  | "storage_boxes"
  | "updated_at"
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
type RequestProductLine = Pick<Tables<"request_items">, "product_id">;
type SortBy = "manual" | "stock" | "updated" | "customer" | "name";
type SortDirection = "asc" | "desc";
type AdjustmentType = "received_qty" | "expected_qty" | "reserved_qty" | "available_qty" | "storage_boxes";

const adjustmentLabels: Record<AdjustmentType, string> = {
  received_qty: "In Stock",
  expected_qty: "Incoming",
  reserved_qty: "Reserved",
  available_qty: "Available",
  storage_boxes: "Storage Boxes",
};

export function ProductsClient() {
  const { role, clientId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [incomingLines, setIncomingLines] = useState<IncomingProductLine[]>([]);
  const [requestLines, setRequestLines] = useState<RequestProductLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("active");
  const [adminClientFilter, setAdminClientFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("manual");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("available_qty");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";
  const isAdmin = role === "admin";

  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>();

    products.forEach((product) => {
      if (product.clients) {
        byId.set(product.clients.id, product.clients.company_name);
      }
    });

    return Array.from(byId.entries()).sort((first, second) => first[1].localeCompare(second[1]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const productSearch = productQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesClient = !isAdmin || adminClientFilter === "all" || product.client_id === adminClientFilter;
      const matchesProduct =
        !productSearch ||
        product.product_name.toLowerCase().includes(productSearch) ||
        (product.sku ?? "").toLowerCase().includes(productSearch) ||
        (product.asin ?? "").toLowerCase().includes(productSearch) ||
        (product.barcode ?? "").toLowerCase().includes(productSearch);

      return matchesClient && matchesProduct;
    });
  }, [adminClientFilter, isAdmin, productQuery, products]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const productsQuery = supabase
      .from("products")
      .select("*, clients(id, company_name)")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    const inventoryQuery = supabase
      .from("inventory")
      .select("id, client_id, product_id, expected_qty, received_qty, available_qty, reserved_qty, processing_qty, storage_boxes, updated_at")
      .is("deleted_at", null);
    const incomingQuery = supabase
      .from("incoming_items")
      .select("inventory_posted_at, product_id, expected_quantity, received_quantity, is_unexpected, tracking_box_id, incoming_shipments!inner(number_of_boxes, statuses(name))")
      .is("deleted_at", null);
    const requestItemsQuery = supabase
      .from("request_items")
      .select("product_id, service_requests!inner(client_id)")
      .is("deleted_at", null);

    if (isClientPortal && clientId) {
      productsQuery.eq("client_id", clientId);
      inventoryQuery.eq("client_id", clientId);
      incomingQuery.eq("incoming_shipments.client_id", clientId);
      requestItemsQuery.eq("service_requests.client_id", clientId);
    }

    const [productsResult, inventoryResult, incomingResult, requestItemsResult] = await Promise.all([
      productsQuery,
      inventoryQuery,
      incomingQuery,
      requestItemsQuery,
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

    if (requestItemsResult.error) {
      setError(requestItemsResult.error.message);
    } else {
      setRequestLines((requestItemsResult.data ?? []) as RequestProductLine[]);
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
    const hasRequestHistory = requestLines.some((line) => line.product_id === product.id);

    if (hasInventory || hasShipmentHistory || hasRequestHistory) {
      setError("This product has inventory or shipment history and cannot be deleted. Archive it instead.");
      return;
    }

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

  async function archiveProduct(product: Product) {
    const nextActive = !product.active;
    const action = nextActive ? "restore" : "archive";

    if (!window.confirm(`${nextActive ? "Restore" : "Archive"} this product?`)) {
      return;
    }

    setError(null);
    const { error: archiveError } = await supabase
      .from("products")
      .update({ active: nextActive })
      .eq("id", product.id);

    if (archiveError) {
      setError(archiveError.message);
    } else {
      await loadData();
      if (action === "archive") {
        setError("Product archived. History remains available in existing records.");
      }
    }
  }

  async function moveProduct(product: Product, direction: "up" | "down") {
    setError(null);
    const siblings = products
      .filter((candidate) => candidate.client_id === product.client_id)
      .sort(compareProductsForDisplay);
    const currentIndex = siblings.findIndex((candidate) => candidate.id === product.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const reordered = [...siblings];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

    const updates = reordered.map((candidate, index) =>
      supabase.from("products").update({ sort_order: index + 1 }).eq("id", candidate.id),
    );
    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      setError(failedUpdate.error.message);
      return;
    }

    setProducts((currentProducts) =>
      currentProducts
        .map((candidate) => {
          const nextIndex = reordered.findIndex((orderedProduct) => orderedProduct.id === candidate.id);
          return nextIndex >= 0 ? { ...candidate, sort_order: nextIndex + 1 } : candidate;
        })
        .sort(compareProductsForDisplay),
    );
  }

  const displayProducts = useMemo(() => {
    const nextProducts = filteredProducts.filter((product) => {
      const matchesStatus =
        clientStatusFilter === "all" ||
        (clientStatusFilter === "active" && product.active) ||
        (clientStatusFilter === "inactive" && !product.active);

      return matchesStatus;
    });

    return nextProducts.sort((first, second) =>
      compareProducts(first, second, sortBy, sortDirection, inventoryRows),
    );
  }, [clientStatusFilter, filteredProducts, inventoryRows, sortBy, sortDirection]);

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

  function openAdjustmentModal(product: Product) {
    setAdjustmentProduct(product);
    setAdjustmentType("available_qty");
    setAdjustmentQuantity("");
    setAdjustmentReason("");
    setAdjustmentNotes("");
  }

  async function saveInventoryAdjustment() {
    if (!adjustmentProduct || adjusting) return;

    const quantity = Number(adjustmentQuantity);

    if (!Number.isInteger(quantity) || quantity === 0) {
      setError("Adjustment quantity must be a non-zero whole number.");
      return;
    }

    if (!adjustmentReason.trim()) {
      setError("Adjustment reason is required.");
      return;
    }

    setAdjusting(true);
    setError(null);
    const { error: adjustmentError } = await supabase.rpc("adjust_inventory_with_audit", {
      p_product_id: adjustmentProduct.id,
      p_client_id: adjustmentProduct.client_id,
      p_adjustment_type: adjustmentType,
      p_quantity: quantity,
      p_reason: adjustmentReason.trim(),
      p_notes: adjustmentNotes.trim() || null,
    });

    if (adjustmentError) {
      setError(adjustmentError.message);
    } else {
      setAdjustmentProduct(null);
      await loadData();
    }

    setAdjusting(false);
  }

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
            <div className={isAdmin ? "grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_10rem_11rem_9rem]" : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]"}>
                {isAdmin ? (
                  <select
                    className={inputClassName}
                    value={adminClientFilter}
                    onChange={(event) => setAdminClientFilter(event.target.value)}
                  >
                    <option value="all">All Clients</option>
                    {clientOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
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
                  <option value="all">All Products</option>
                  <option value="active">Active</option>
                  <option value="inactive">Archived</option>
                </select>
                {isAdmin ? (
                  <>
                    <select
                      className={inputClassName}
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as SortBy)}
                    >
                      <option value="manual">Manual order</option>
                      <option value="stock">Stock quantity</option>
                      <option value="updated">Date updated</option>
                      <option value="customer">Customer</option>
                      <option value="name">Product name</option>
                    </select>
                    <select
                      className={inputClassName}
                      value={sortDirection}
                      onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </>
                ) : null}
            </div>
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
                onArchiveProduct={archiveProduct}
                onDeleteProduct={deleteProduct}
                onAdjustProduct={openAdjustmentModal}
                onMoveProduct={moveProduct}
              />
            </div>
          )}
        </Panel>
      </div>
      {adjustmentProduct && isAdmin ? (
        <InventoryAdjustmentModal
          product={adjustmentProduct}
          inventoryRow={inventoryRows.find((row) => row.product_id === adjustmentProduct.id) ?? null}
          adjustmentType={adjustmentType}
          quantity={adjustmentQuantity}
          reason={adjustmentReason}
          notes={adjustmentNotes}
          saving={adjusting}
          onAdjustmentTypeChange={setAdjustmentType}
          onClose={() => setAdjustmentProduct(null)}
          onNotesChange={setAdjustmentNotes}
          onQuantityChange={setAdjustmentQuantity}
          onReasonChange={setAdjustmentReason}
          onSave={saveInventoryAdjustment}
        />
      ) : null}
    </div>
  );
}

function ProductsTable({
  products,
  inventoryRows,
  incomingLines,
  isClientPortal,
  onArchiveProduct,
  onAdjustProduct,
  onDeleteProduct,
  onMoveProduct,
}: {
  products: Product[];
  inventoryRows: InventoryRow[];
  incomingLines: IncomingProductLine[];
  isClientPortal: boolean;
  onArchiveProduct: (product: Product) => Promise<void>;
  onAdjustProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => Promise<void>;
  onMoveProduct: (product: Product, direction: "up" | "down") => Promise<void>;
}) {
  return (
    <table className="w-full min-w-[1040px] table-fixed text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[0.68rem] font-medium text-slate-500 backdrop-blur">
        <tr>
          <th className="w-[16rem] px-2.5 py-2.5 font-semibold">Product</th>
          <th className="w-24 px-2.5 py-2.5 font-semibold">SKU <SortMark /></th>
          <th className="w-28 px-2.5 py-2.5 font-semibold">ASIN / UPC <SortMark /></th>
          <th className="w-24 px-2.5 py-2.5 font-semibold">FNSKU <SortMark /></th>
          <th className="w-20 px-2 py-2.5 text-center font-semibold">In Stock <SortMark /></th>
          <th className="w-20 px-2 py-2.5 text-center font-semibold">Incoming <SortMark /></th>
          <th className="w-20 px-2 py-2.5 text-center font-semibold">Reserved <SortMark /></th>
          <th className="w-24 px-2.5 py-2.5 font-semibold">Last Updated <SortMark /></th>
          <th className="w-44 px-2.5 py-2.5 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {products.map((product) => {
          const summary = getClientProductSummary(product, inventoryRows, incomingLines);

          return (
            <tr key={product.id} className="cursor-pointer bg-white transition hover:bg-slate-50/80">
              <td className="px-2.5 py-2.5 font-medium text-slate-950">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ProductThumb product={product} />
                  <div className="min-w-0">
                    <p className="line-clamp-2 whitespace-normal break-words font-medium leading-snug text-slate-950">{product.product_name}</p>
                    {!isClientPortal && product.clients ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{product.clients.company_name}</p>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="truncate px-2.5 py-2 text-slate-600">{product.sku ?? "-"}</td>
              <td className="truncate px-2.5 py-2 text-slate-600">{product.asin ?? product.barcode ?? "-"}</td>
              <td className="truncate px-2.5 py-2 text-slate-600">{product.fnsku ?? "-"}</td>
              <td className="whitespace-nowrap px-2 py-2 text-center text-slate-700">{formatNumber(summary.inStock)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-center text-slate-700">{formatNumber(summary.incomingUnits)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-center text-slate-700">{formatNumber(summary.reservedUnits)}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-slate-600">{formatDateTime(summary.lastUpdated ?? product.updated_at)}</td>
              <td className="px-2.5 py-2">
                <div className="flex justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${product.product_name} up`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                    onClick={() => void onMoveProduct(product, "up")}
                  >
                    <ArrowUpIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${product.product_name} down`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                    onClick={() => void onMoveProduct(product, "down")}
                  >
                    <ArrowDownIcon />
                  </button>
                  {!isClientPortal ? (
                    <button
                      type="button"
                      aria-label={`Adjust inventory for ${product.product_name}`}
                      className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => onAdjustProduct(product)}
                    >
                      <InventoryEditIcon />
                    </button>
                  ) : null}
                  <Link
                    href={`/products/${product.id}/edit`}
                    aria-label={`Edit ${product.product_name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <PencilIcon />
                  </Link>
                  <button
                    type="button"
                    aria-label={`${product.active ? "Archive" : "Restore"} ${product.product_name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                    onClick={() => void onArchiveProduct(product)}
                  >
                    <ArchiveIcon archived={!product.active} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${product.product_name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
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

function InventoryAdjustmentModal({
  product,
  inventoryRow,
  adjustmentType,
  quantity,
  reason,
  notes,
  saving,
  onAdjustmentTypeChange,
  onClose,
  onNotesChange,
  onQuantityChange,
  onReasonChange,
  onSave,
}: {
  product: Product;
  inventoryRow: InventoryRow | null;
  adjustmentType: AdjustmentType;
  quantity: string;
  reason: string;
  notes: string;
  saving: boolean;
  onAdjustmentTypeChange: (value: AdjustmentType) => void;
  onClose: () => void;
  onNotesChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => Promise<void>;
}) {
  const currentValues: Record<AdjustmentType, number> = {
    available_qty: inventoryRow?.available_qty ?? 0,
    expected_qty: inventoryRow?.expected_qty ?? 0,
    received_qty: inventoryRow?.received_qty ?? 0,
    reserved_qty: inventoryRow?.reserved_qty ?? 0,
    storage_boxes: inventoryRow?.storage_boxes ?? 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">Adjust inventory</h3>
          <p className="mt-1 text-sm text-slate-500">
            {product.product_name}
            {product.clients ? ` · ${product.clients.company_name}` : ""}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {Object.entries(adjustmentLabels).map(([key, label]) => (
              <div key={key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                  {formatNumber(currentValues[key as AdjustmentType])}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adjustment type</span>
              <select
                className={inputClassName}
                value={adjustmentType}
                onChange={(event) => onAdjustmentTypeChange(event.target.value as AdjustmentType)}
              >
                {Object.entries(adjustmentLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity adjustment</span>
              <input
                className={inputClassName}
                inputMode="numeric"
                placeholder="+50 or -12"
                type="number"
                value={quantity}
                onChange={(event) => onQuantityChange(event.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</span>
            <input
              className={inputClassName}
              placeholder="Inventory recount"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes optional</span>
            <textarea
              className={textAreaClassName}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save adjustment"}
          </button>
        </div>
      </div>
    </div>
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
        className="block size-9 shrink-0 rounded-md border border-slate-200 bg-cover bg-center bg-slate-100"
        style={{ backgroundImage: `url("${product.photo_url}")` }}
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400">
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

function compareProductsForDisplay(first: Product, second: Product) {
  const orderDifference = first.sort_order - second.sort_order;

  if (orderDifference !== 0) {
    return orderDifference;
  }

  return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
}

function compareProducts(
  first: Product,
  second: Product,
  sortBy: SortBy,
  sortDirection: SortDirection,
  inventoryRows: InventoryRow[],
) {
  const direction = sortDirection === "asc" ? 1 : -1;
  let comparison = 0;

  if (sortBy === "stock") {
    comparison = getProductAvailableStock(first, inventoryRows) - getProductAvailableStock(second, inventoryRows);
  } else if (sortBy === "updated") {
    comparison = getProductUpdatedAt(first, inventoryRows).getTime() - getProductUpdatedAt(second, inventoryRows).getTime();
  } else if (sortBy === "customer") {
    comparison = (first.clients?.company_name ?? "").localeCompare(second.clients?.company_name ?? "");
  } else if (sortBy === "name") {
    comparison = first.product_name.localeCompare(second.product_name);
  } else {
    comparison = compareProductsForDisplay(first, second);
  }

  return comparison === 0 ? compareProductsForDisplay(first, second) : comparison * direction;
}

function getProductAvailableStock(product: Product, inventoryRows: InventoryRow[]) {
  return inventoryRows
    .filter((row) => row.product_id === product.id)
    .reduce((sum, row) => sum + row.available_qty, 0);
}

function getProductUpdatedAt(product: Product, inventoryRows: InventoryRow[]) {
  const inventoryUpdatedAt = inventoryRows
    .filter((row) => row.product_id === product.id)
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return new Date(inventoryUpdatedAt ?? product.updated_at);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
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

function ArrowUpIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
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

function InventoryEditIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M4 17h16" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
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

function ArchiveIcon({ archived }: { archived: boolean }) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M6 7v13h12V7" />
      <path d="M9 11h6" />
      {archived ? <path d="m9 16 3-3 3 3" /> : <path d="m9 14 3 3 3-3" />}
    </svg>
  );
}
