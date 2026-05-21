"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Tables<"products"> & {
  clients: Client | null;
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

export function ProductsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [clientsResult, productsResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name"),
      supabase
        .from("products")
        .select("*, clients(id, company_name)")
        .is("deleted_at", null)
        .order("product_name"),
    ]);

    if (clientsResult.error) {
      setError(clientsResult.error.message);
    } else {
      setClients(clientsResult.data ?? []);
    }

    if (productsResult.error) {
      setError(productsResult.error.message);
    } else {
      setProducts((productsResult.data ?? []) as Product[]);
    }

    setLoading(false);
  }

  function startEdit(product: Product) {
    setEditing(product);
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
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    if (!form.client_id || !form.product_name.trim()) {
      setError("Client and product name are required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      client_id: form.client_id,
      product_name: form.product_name.trim(),
      sku: form.sku.trim() || null,
      fnsku: form.fnsku.trim() || null,
      asin: form.asin.trim() || null,
      barcode: form.barcode.trim() || null,
      barcode_type: form.barcode_type.trim() || null,
      photo_url: form.photo_url.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };

    const result = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      await loadData();
    }

    setSaving(false);
  }

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
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Maintain product records by client before they are used in inbound shipments and inventory."
        action={<StatusBadge tone="blue">{products.length} products</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Product catalog" description="Linked to client accounts in Supabase.">
          {loading ? (
            <LoadingState label="Loading products..." />
          ) : products.length === 0 ? (
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
                  {products.map((product) => (
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
                          <Button type="button" variant="secondary" onClick={() => startEdit(product)}>
                            Edit
                          </Button>
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

        <Panel title={editing ? "Edit product" : "Create product"}>
          <form className="space-y-4" onSubmit={(event) => void saveProduct(event)}>
            <Field label="Client">
              <select
                className={inputClassName}
                required
                value={form.client_id}
                onChange={(event) => setForm({ ...form, client_id: event.target.value })}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Product name">
              <input
                className={inputClassName}
                required
                value={form.product_name}
                onChange={(event) => setForm({ ...form, product_name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <Field label="SKU">
                <input className={inputClassName} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
              </Field>
              <Field label="FNSKU">
                <input className={inputClassName} value={form.fnsku} onChange={(event) => setForm({ ...form, fnsku: event.target.value })} />
              </Field>
              <Field label="ASIN">
                <input className={inputClassName} value={form.asin} onChange={(event) => setForm({ ...form, asin: event.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Barcode">
                <input
                  className={inputClassName}
                  value={form.barcode}
                  onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                />
              </Field>
              <Field label="Barcode type">
                <input
                  className={inputClassName}
                  placeholder="Code 128, UPC, QR"
                  value={form.barcode_type}
                  onChange={(event) => setForm({ ...form, barcode_type: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Photo URL">
              <input className={inputClassName} value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Active product
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || clients.length === 0}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create product"}
              </Button>
              {editing ? (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
