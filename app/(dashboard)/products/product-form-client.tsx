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
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products">;
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

export function ProductFormClient({ productId }: { productId?: string }) {
  const router = useRouter();
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const [clients, setClients] = useState<Client[]>([]);
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
