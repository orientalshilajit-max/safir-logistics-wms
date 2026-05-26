"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products">;
type Status = Pick<Tables<"statuses">, "id" | "name">;
type ProductForm = {
  client_id: string;
  product_name: string;
  quantity_items: string;
  quantity_boxes: string;
  tracking_number: string;
  carrier: string;
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
  quantity_items: "1",
  quantity_boxes: "1",
  tracking_number: "",
  carrier: "",
  sku: "",
  fnsku: "",
  asin: "",
  barcode: "",
  barcode_type: "",
  photo_url: "",
  notes: "",
  active: true,
};

export function ProductFormClient({ productId }: { productId?: string }) {
  const router = useRouter();
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const [clients, setClients] = useState<Client[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const clientsQuery = supabase
        .from("clients")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name");
    const statusesQuery = supabase
      .from("statuses")
      .select("id, name")
      .eq("category", "incoming_shipment")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order");
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

    const [clientsResult, statusesResult, productResult] = await Promise.all([
      isClientPortal ? Promise.resolve({ data: [], error: null }) : clientsQuery,
      statusesQuery,
      productQuery,
    ]);

    if (clientsResult.error) {
      setError(clientsResult.error.message);
    } else {
      setClients(clientsResult.data ?? []);
    }

    if (statusesResult.error) {
      setError(statusesResult.error.message);
    } else {
      setStatuses(statusesResult.data ?? []);
    }

    if (productResult.error) {
      setError(productResult.error.message);
    } else if (productResult.data) {
      const product = productResult.data as Product;
      setForm({
        client_id: product.client_id,
        product_name: product.product_name,
        quantity_items: "1",
        quantity_boxes: "1",
        tracking_number: "",
        carrier: "",
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

    setLoading(false);
  }, [clientId, isClientPortal, productId]);

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

    const quantityItems = Number(form.quantity_items);
    const quantityBoxes = Number(form.quantity_boxes);

    if (isClientPortal && (!Number.isInteger(quantityItems) || quantityItems <= 0)) {
      setError("Quantity of items must be a whole number greater than 0.");
      return;
    }

    if (isClientPortal && (!Number.isInteger(quantityBoxes) || quantityBoxes < 0)) {
      setError("Quantity of boxes must be a whole number zero or greater.");
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

    const payload = {
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

    const result = productId
      ? await supabase.from("products").update(payload).eq("id", productId)
      : await supabase.from("products").insert(payload).select("id").single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    if (isClientPortal && !productId) {
      const productIdValue = "data" in result ? result.data?.id : null;
      const inTransitStatus =
        statuses.find((status) => status.name === "In Transit") ??
        statuses.find((status) => status.name === "Expected") ??
        statuses[0];

      if (!productIdValue || !inTransitStatus) {
        setError("Unable to create inbound product record.");
        setSaving(false);
        return;
      }

      const trackingNumbers = form.tracking_number.trim() ? [form.tracking_number.trim()] : [];
      const carrier = form.carrier.trim() || "Client supplied";
      const shipmentResult = await supabase
        .from("incoming_shipments")
        .insert({
          client_id: form.client_id,
          carrier,
          tracking_numbers: trackingNumbers,
          number_of_boxes: quantityBoxes,
          status_id: inTransitStatus.id,
          notes: form.notes.trim() || null,
        })
        .select("id")
        .single();

      if (shipmentResult.error || !shipmentResult.data) {
        setError(shipmentResult.error?.message ?? "Unable to create inbound shipment.");
        setSaving(false);
        return;
      }

      const trackingNumber = trackingNumbers[0] ?? `Manual-${shipmentResult.data.id.slice(0, 8)}`;
      const { data: trackingBox, error: trackingBoxError } = await supabase
        .from("incoming_tracking_boxes")
        .insert({
          shipment_id: shipmentResult.data.id,
          tracking_number: trackingNumber,
          carrier,
          status: "In Transit",
        })
        .select("id")
        .single();

      if (trackingBoxError) {
        setError(trackingBoxError.message);
        setSaving(false);
        return;
      }

      const { error: itemError } = await supabase.from("incoming_items").insert({
        shipment_id: shipmentResult.data.id,
        product_id: productIdValue,
        tracking_box_id: trackingBox.id,
        expected_quantity: quantityItems,
        notes: form.notes.trim() || null,
      });

      if (itemError) {
        setError(itemError.message);
        setSaving(false);
        return;
      }
    }

    router.push("/products");
    router.refresh();
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
          {isClientPortal ? (
            <>
              <Field label="Quantity of items">
                <input className={inputClassName} min="1" required type="number" value={form.quantity_items} onChange={(event) => setForm({ ...form, quantity_items: event.target.value })} />
              </Field>
              <Field label="Quantity of boxes">
                <input className={inputClassName} min="0" required type="number" value={form.quantity_boxes} onChange={(event) => setForm({ ...form, quantity_boxes: event.target.value })} />
              </Field>
              <Field label="Tracking number">
                <input className={inputClassName} value={form.tracking_number} onChange={(event) => setForm({ ...form, tracking_number: event.target.value })} />
              </Field>
              <Field label="Carrier">
                <input className={inputClassName} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
              </Field>
            </>
          ) : null}
          {isClientPortal ? null : (
            <>
              <Field label="SKU">
                <input className={inputClassName} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
              </Field>
              <Field label="FNSKU">
                <input className={inputClassName} value={form.fnsku} onChange={(event) => setForm({ ...form, fnsku: event.target.value })} />
              </Field>
              <Field label="ASIN">
                <input className={inputClassName} value={form.asin} onChange={(event) => setForm({ ...form, asin: event.target.value })} />
              </Field>
              <Field label="Barcode">
                <input className={inputClassName} value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
              </Field>
              <Field label="Barcode type">
                <input className={inputClassName} placeholder="Code 128, UPC, QR" value={form.barcode_type} onChange={(event) => setForm({ ...form, barcode_type: event.target.value })} />
              </Field>
              <Field label="Photo URL">
                <input className={inputClassName} value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} />
              </Field>
            </>
          )}
          <div className="lg:col-span-2">
            <Field label="Notes">
              <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
          {isClientPortal ? null : (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 lg:col-span-2">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Active product
            </label>
          )}
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
    </div>
  );
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
