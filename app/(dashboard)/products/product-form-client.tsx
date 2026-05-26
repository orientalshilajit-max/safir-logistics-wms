"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables, TablesInsert } from "@/app/types/database.types";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products">;
type InventoryDetail = Pick<
  Tables<"inventory">,
  "available_qty" | "expected_qty" | "received_qty" | "reserved_qty" | "processing_qty" | "storage_boxes"
>;
type IncomingLineDetail = Pick<
  Tables<"incoming_items">,
  "expected_quantity" | "received_quantity" | "inventory_posted_at" | "shipment_id"
> & {
  incoming_shipments: (Pick<Tables<"incoming_shipments">, "created_at" | "number_of_boxes" | "tracking_numbers"> & {
    statuses: Pick<Tables<"statuses">, "name"> | null;
  }) | null;
};
type RequestLineDetail = Pick<Tables<"request_items">, "requested_quantity"> & {
  service_requests: Pick<Tables<"service_requests">, "created_at" | "request_number" | "status"> | null;
};
type InventoryAdjustment = Pick<
  Tables<"inventory_adjustments">,
  "adjustment_type" | "created_at" | "new_value" | "notes" | "previous_value" | "quantity" | "reason"
>;
type AdjustmentType = "received_qty" | "expected_qty" | "reserved_qty" | "available_qty" | "storage_boxes";
type InventoryDraft = Record<AdjustmentType, string>;
type AdminProductDetail = {
  adjustments: InventoryAdjustment[];
  incomingLines: IncomingLineDetail[];
  inventory: InventoryDetail | null;
  requestLines: RequestLineDetail[];
};
type ProductForm = {
  client_id: string;
  product_name: string;
  sku: string;
  fnsku: string;
  asin: string;
  barcode: string;
  barcode_type: string;
  photo_url: string;
  notes: string;
  active: boolean;
};

const emptyForm: ProductForm = {
  client_id: "",
  product_name: "",
  sku: "",
  fnsku: "",
  asin: "",
  barcode: "",
  barcode_type: "",
  photo_url: "",
  notes: "",
  active: true,
};

const adjustmentLabels: Record<AdjustmentType, string> = {
  received_qty: "In Stock",
  expected_qty: "Incoming",
  reserved_qty: "Reserved",
  available_qty: "Available",
  storage_boxes: "Storage Boxes",
};

const inventoryFields: Array<{ key: AdjustmentType; label: string; inputLabel: string }> = [
  { key: "received_qty", label: adjustmentLabels.received_qty, inputLabel: "in_stock_units" },
  { key: "expected_qty", label: adjustmentLabels.expected_qty, inputLabel: "incoming_units" },
  { key: "reserved_qty", label: adjustmentLabels.reserved_qty, inputLabel: "reserved_units" },
  { key: "available_qty", label: adjustmentLabels.available_qty, inputLabel: "available_units" },
  { key: "storage_boxes", label: adjustmentLabels.storage_boxes, inputLabel: "storage_boxes" },
];

export function ProductFormClient({ productId }: { productId?: string }) {
  const router = useRouter();
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adminDetail, setAdminDetail] = useState<AdminProductDetail | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraft>(emptyInventoryDraft());
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const clientsQuery = supabase
        .from("clients")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name");
    const productQuery =
      productId
        ? supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .is("deleted_at", null)
          .single()
        : Promise.resolve({ data: null, error: null });

    if (isClientPortal && clientId) {
      clientsQuery.eq("id", clientId);
    }

    const [clientsResult, productResult] = await Promise.all([
      isClientPortal ? Promise.resolve({ data: [], error: null }) : clientsQuery,
      productQuery,
    ]);

    if (clientsResult.error) {
      setError(clientsResult.error.message);
    } else {
      setClients(clientsResult.data ?? []);
    }

    if (productResult.error) {
      setError(productResult.error.message);
    } else if (productResult.data) {
      const product = productResult.data as Product;
      setForm({
        client_id: product.client_id,
        product_name: product.product_name,
        sku: product.sku ?? "",
        fnsku: product.fnsku ?? "",
        asin: product.asin ?? "",
        barcode: product.barcode ?? "",
        barcode_type: product.barcode_type ?? "",
        photo_url: product.photo_url ?? "",
        notes: product.notes ?? "",
        active: product.active,
      });
    } else if (isClientPortal && clientId) {
      setForm((current) => ({ ...current, client_id: clientId }));
    }

    if (productId && role === "admin") {
      const [inventoryResult, incomingResult, requestResult, adjustmentsResult] = await Promise.all([
        supabase
          .from("inventory")
          .select("available_qty, expected_qty, received_qty, reserved_qty, processing_qty, storage_boxes")
          .eq("product_id", productId)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("incoming_items")
          .select("expected_quantity, received_quantity, inventory_posted_at, shipment_id, incoming_shipments(created_at, number_of_boxes, tracking_numbers, statuses(name))")
          .eq("product_id", productId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("request_items")
          .select("requested_quantity, service_requests(created_at, request_number, status)")
          .eq("product_id", productId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("inventory_adjustments")
          .select("adjustment_type, created_at, new_value, notes, previous_value, quantity, reason")
          .eq("product_id", productId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (inventoryResult.error) setError(inventoryResult.error.message);
      if (incomingResult.error) setError(incomingResult.error.message);
      if (requestResult.error) setError(requestResult.error.message);
      if (adjustmentsResult.error) setError(adjustmentsResult.error.message);

      setAdminDetail({
        adjustments: (adjustmentsResult.data ?? []) as InventoryAdjustment[],
        incomingLines: (incomingResult.data ?? []) as IncomingLineDetail[],
        inventory: (inventoryResult.data as InventoryDetail | null) ?? null,
        requestLines: (requestResult.data ?? []) as RequestLineDetail[],
      });
    } else {
      setAdminDetail(null);
    }

    setLoading(false);
  }, [clientId, isClientPortal, productId, role]);

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

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!form.client_id || !form.product_name.trim()) {
      setError("Client and product name are required.");
      return;
    }

    setSaving(true);
    setError(null);

    let photoUrl = form.photo_url.trim() || null;

    if (imageFile) {
      const uploadResult = await uploadProductImage(imageFile, form.client_id);

      if (uploadResult.error) {
        setError(uploadResult.error);
        setSaving(false);
        return;
      }

      photoUrl = uploadResult.url;
    }

    const payload: TablesInsert<"products"> = {
      client_id: form.client_id,
      product_name: form.product_name.trim(),
      sku: form.sku.trim() || null,
      fnsku: form.fnsku.trim() || null,
      asin: form.asin.trim() || null,
      barcode: form.barcode.trim() || null,
      barcode_type: form.barcode_type.trim() || null,
      photo_url: photoUrl,
      notes: form.notes.trim() || null,
      active: form.active,
    };

    if (!productId) {
      const { data: lastProduct } = await supabase
        .from("products")
        .select("sort_order")
        .eq("client_id", form.client_id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      payload.sort_order = (lastProduct?.sort_order ?? 0) + 1;
    }

    const result = productId
      ? await supabase.from("products").update(payload).eq("id", productId)
      : await supabase.from("products").insert(payload).select("id").single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    router.push("/products");
    router.refresh();
  }

  function openAdjustmentModal() {
    setAdjustmentOpen(true);
    setInventoryDraft(inventoryDetailToDraft(adminDetail?.inventory ?? null));
    setAdjustmentReason("");
    setAdjustmentNotes("");
  }

  async function saveInventoryAdjustment() {
    if (!productId || adjusting) return;

    const nextValues = parseInventoryDraft(inventoryDraft);

    if (!nextValues) {
      setError("Inventory values must be whole numbers at or above zero.");
      return;
    }

    if (!adjustmentReason.trim()) {
      setError("Adjustment reason is required.");
      return;
    }

    const currentInventory = adminDetail?.inventory ?? null;
    const changes = inventoryFields
      .map((field) => ({
        adjustmentType: field.key,
        nextValue: nextValues[field.key],
        previousValue: getInventoryValue(currentInventory, field.key),
      }))
      .filter((change) => change.nextValue !== change.previousValue);

    if (changes.length === 0) {
      setError("Change at least one inventory value before saving.");
      return;
    }

    setAdjusting(true);
    setError(null);
    setSuccess(null);

    for (const change of changes) {
      const { error: adjustmentError } = await supabase.rpc("adjust_inventory_with_audit", {
        p_adjustment_type: change.adjustmentType,
        p_client_id: form.client_id,
        p_notes: adjustmentNotes.trim() || null,
        p_product_id: productId,
        p_quantity: change.nextValue - change.previousValue,
        p_reason: adjustmentReason.trim(),
      });

      if (adjustmentError) {
        setError(adjustmentError.message);
        setAdjusting(false);
        return;
      }
    }

    try {
      setAdjustmentOpen(false);
      await loadData();
      setSuccess("Inventory updated.");
    } finally {
      setAdjusting(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading product..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          href="/products"
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to products
        </Link>
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <Panel title={productId ? "Edit product" : "Add product"}>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void saveProduct(event)}>
          {isClientPortal ? null : (
            <Field label="Client">
              <select className={inputClassName} required value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}>
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Product name">
            <input className={inputClassName} required value={form.product_name} onChange={(event) => setForm({ ...form, product_name: event.target.value })} />
          </Field>
          <Field label="Product image">
            <div className="flex items-center gap-3">
              <span
                className="block size-14 shrink-0 rounded-md border border-slate-200 bg-slate-100 bg-cover bg-center"
                style={form.photo_url ? { backgroundImage: `url("${form.photo_url}")` } : undefined}
              />
              <div className="min-w-0 flex-1">
                <input
                  className={inputClassName}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  type="file"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    if (!nextFile) {
                      setImageFile(null);
                      return;
                    }

                    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(nextFile.type)) {
                      setError("Upload a PNG, JPG, JPEG, or WEBP image.");
                      event.target.value = "";
                      return;
                    }

                    setError(null);
                    setImageFile(nextFile);
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {imageFile ? imageFile.name : form.photo_url ? "Current product image will be kept." : "PNG, JPG, JPEG, or WEBP."}
                </p>
              </div>
            </div>
          </Field>
          <Field label="SKU optional">
            <input className={inputClassName} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
          </Field>
          <Field label="ASIN optional">
            <input className={inputClassName} value={form.asin} onChange={(event) => setForm({ ...form, asin: event.target.value })} />
          </Field>
          <Field label="UPC optional">
            <input className={inputClassName} value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
          </Field>
          <Field label="FNSKU optional">
            <input className={inputClassName} value={form.fnsku} onChange={(event) => setForm({ ...form, fnsku: event.target.value })} />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Notes">
              <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
          <Field label="Status">
            <select className={inputClassName} value={form.active ? "active" : "inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}>
              <option value="active">Active</option>
              <option value="inactive">Archived</option>
            </select>
          </Field>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" disabled={saving || (!isClientPortal && clients.length === 0)}>
              {saving ? "Saving..." : "Save product"}
            </Button>
            <Link href="/products" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
      {productId && role === "admin" && adminDetail ? (
        <AdminProductDetailPanel detail={adminDetail} onAdjust={openAdjustmentModal} />
      ) : null}
      {productId && role === "admin" && adminDetail && adjustmentOpen ? (
        <InventoryAdjustmentModal
          draft={inventoryDraft}
          inventory={adminDetail.inventory}
          notes={adjustmentNotes}
          onClose={() => setAdjustmentOpen(false)}
          onDraftChange={setInventoryDraft}
          onNotesChange={setAdjustmentNotes}
          onReasonChange={setAdjustmentReason}
          onSave={saveInventoryAdjustment}
          reason={adjustmentReason}
          saving={adjusting}
        />
      ) : null}
    </div>
  );
}

function AdminProductDetailPanel({ detail, onAdjust }: { detail: AdminProductDetail; onAdjust: () => void }) {
  const inventory = detail.inventory;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Inventory totals">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700"
            onClick={onAdjust}
          >
            Edit Inventory
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <DetailMetric label="In Stock" value={inventory?.received_qty ?? 0} />
          <DetailMetric label="Available" value={inventory?.available_qty ?? 0} />
          <DetailMetric label="Reserved" value={inventory?.reserved_qty ?? 0} />
          <DetailMetric label="Incoming" value={inventory?.expected_qty ?? 0} />
          <DetailMetric label="In Process" value={inventory?.processing_qty ?? 0} />
          <DetailMetric label="Storage Boxes" value={inventory?.storage_boxes ?? 0} />
        </div>
      </Panel>
      <Panel title="Inventory adjustment history">
        <CompactList
          emptyLabel="No inventory adjustments yet."
          rows={detail.adjustments.map((adjustment) => ({
            key: `${adjustment.created_at}-${adjustment.adjustment_type}`,
            left: adjustment.reason,
            middle: `${formatSignedNumber(adjustment.quantity)} ${formatAdjustmentType(adjustment.adjustment_type)}`,
            right: formatShortDate(adjustment.created_at),
            sub: `${formatNumber(adjustment.previous_value)} → ${formatNumber(adjustment.new_value)}${adjustment.notes ? ` · ${adjustment.notes}` : ""}`,
          }))}
        />
      </Panel>
      <Panel title="Recent incoming shipments">
        <CompactList
          emptyLabel="No recent incoming shipment history."
          rows={detail.incomingLines.map((line) => ({
            key: line.shipment_id,
            left: line.incoming_shipments?.tracking_numbers?.[0] ?? "Shipment",
            middle: `${formatNumber(line.expected_quantity)} expected`,
            right: line.incoming_shipments?.statuses?.name ?? "In Transit",
            sub: `${formatNumber(line.received_quantity)} received · ${line.incoming_shipments?.number_of_boxes ?? 0} boxes · ${formatShortDate(line.incoming_shipments?.created_at)}`,
          }))}
        />
      </Panel>
      <Panel title="Recent service requests">
        <CompactList
          emptyLabel="No recent service requests."
          rows={detail.requestLines.map((line) => ({
            key: line.service_requests?.request_number ?? `${line.requested_quantity}-${line.service_requests?.created_at}`,
            left: line.service_requests?.request_number ?? "Request",
            middle: `${formatNumber(line.requested_quantity)} units`,
            right: line.service_requests?.status ?? "Draft",
            sub: formatShortDate(line.service_requests?.created_at),
          }))}
        />
      </Panel>
    </div>
  );
}

function InventoryAdjustmentModal({
  draft,
  inventory,
  notes,
  reason,
  saving,
  onClose,
  onDraftChange,
  onNotesChange,
  onReasonChange,
  onSave,
}: {
  draft: InventoryDraft;
  inventory: InventoryDetail | null;
  notes: string;
  reason: string;
  saving: boolean;
  onClose: () => void;
  onDraftChange: (value: InventoryDraft) => void;
  onNotesChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">Edit Inventory</h3>
          <p className="mt-1 text-sm text-slate-500">Changes are saved with an audit trail.</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {inventoryFields.map((field) => (
              <div key={field.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                  {formatNumber(getInventoryValue(inventory, field.key))}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {inventoryFields.map((field) => (
              <label key={field.key} className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.inputLabel}</span>
                <input
                  className={inputClassName}
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={draft[field.key]}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      [field.key]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason / Note</span>
            <input
              className={inputClassName}
              placeholder="Manual recount"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes optional</span>
            <textarea className={textAreaClassName} value={notes} onChange={(event) => onNotesChange(event.target.value)} />
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
            {saving ? "Saving..." : "Save inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessBanner({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
      {message}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{formatNumber(value)}</p>
    </div>
  );
}

function CompactList({
  emptyLabel,
  rows,
}: {
  emptyLabel: string;
  rows: Array<{ key: string; left: string; middle: string; right: string; sub: string }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_8rem] sm:items-center">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-950">{row.left}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{row.sub}</p>
          </div>
          <p className="text-slate-600">{row.middle}</p>
          <StatusBadge tone={statusTone(row.right)}>{row.right}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

function statusTone(status: string): "slate" | "emerald" | "blue" | "amber" | "rose" | "orange" | "indigo" | "cyan" {
  if (["Completed", "Received", "Paid"].includes(status)) return "emerald";
  if (["Issue", "Rejected", "Cancelled", "Issue / On Hold"].includes(status)) return "rose";
  if (["Approved", "In Progress", "Ready to Ship", "Shipped"].includes(status)) return "blue";
  if (["Pending Approval", "Arrived at Prep", "Waiting Labels"].includes(status)) return "orange";
  return "slate";
}

function emptyInventoryDraft(): InventoryDraft {
  return {
    available_qty: "0",
    expected_qty: "0",
    received_qty: "0",
    reserved_qty: "0",
    storage_boxes: "0",
  };
}

function inventoryDetailToDraft(inventory: InventoryDetail | null): InventoryDraft {
  return {
    available_qty: String(inventory?.available_qty ?? 0),
    expected_qty: String(inventory?.expected_qty ?? 0),
    received_qty: String(inventory?.received_qty ?? 0),
    reserved_qty: String(inventory?.reserved_qty ?? 0),
    storage_boxes: String(inventory?.storage_boxes ?? 0),
  };
}

function parseInventoryDraft(draft: InventoryDraft): Record<AdjustmentType, number> | null {
  const parsed = {} as Record<AdjustmentType, number>;

  for (const field of inventoryFields) {
    const value = Number(draft[field.key]);

    if (!Number.isInteger(value) || value < 0) {
      return null;
    }

    parsed[field.key] = value;
  }

  return parsed;
}

function getInventoryValue(inventory: InventoryDetail | null, key: AdjustmentType) {
  return inventory?.[key] ?? 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatAdjustmentType(value: string) {
  return value
    .replace("_qty", "")
    .replace("_boxes", " boxes")
    .replace(/_/g, " ");
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function uploadProductImage(file: File, clientId: string): Promise<{ url: string | null; error: string | null }> {
  const safeName = file.name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
  const storagePath = `${clientId}/${Date.now()}-${safeName || "product-image"}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return { url: null, error: error.message };
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(storagePath);

  return { url: data.publicUrl, error: null };
}
