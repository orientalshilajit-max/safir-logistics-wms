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

type Service = Tables<"services">;
type PricingType = Service["pricing_type"];

export const pricingTypes: PricingType[] = [
  "per_unit",
  "per_box",
  "per_shipment",
  "per_pallet",
  "per_order",
  "per_month",
  "manual",
];

type ServiceForm = {
  name: string;
  category: string;
  description: string;
  pricing_type: PricingType;
  default_price: string;
  active: boolean;
  visible_to_client: boolean;
};

const emptyForm: ServiceForm = {
  name: "",
  category: "",
  description: "",
  pricing_type: "per_unit",
  default_price: "0.00",
  active: true,
  visible_to_client: true,
};

export function ServiceFormClient({ serviceId }: { serviceId?: string }) {
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [loading, setLoading] = useState(Boolean(serviceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadService = useCallback(async () => {
    if (!serviceId) return;

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .is("deleted_at", null)
      .single();

    if (loadError) {
      setError(loadError.message);
    } else {
      setForm({
        name: data.name,
        category: data.category,
        description: data.description ?? "",
        pricing_type: data.pricing_type,
        default_price: String(data.default_price),
        active: data.active,
        visible_to_client: data.visible_to_client,
      });
    }

    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    let active = true;

    async function loadInitialService() {
      await Promise.resolve();
      if (active) {
        await loadService();
      }
    }

    void loadInitialService();

    return () => {
      active = false;
    };
  }, [loadService]);

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !isAdmin) return;

    const defaultPrice = Number(form.default_price);

    if (!form.name.trim() || !form.category.trim()) {
      setError("Service name and category are required.");
      return;
    }

    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      setError("Default price must be zero or greater.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim() || null,
      pricing_type: form.pricing_type,
      default_price: defaultPrice,
      active: form.active,
      visible_to_client: form.visible_to_client,
    };

    const result = serviceId
      ? await supabase.from("services").update(payload).eq("id", serviceId)
      : await supabase.from("services").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    router.push("/services");
    router.refresh();
  }

  if (loading) {
    return <LoadingState label="Loading service..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/services" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Back to services
        </Link>
      </div>
      <ErrorBanner message={error} />
      <Panel title={serviceId ? "Edit service" : "Add service"} description={isAdmin ? undefined : "Admin role required to manage services."}>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void saveService(event)}>
          <Field label="Name">
            <input className={inputClassName} disabled={!isAdmin} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Category">
            <input className={inputClassName} disabled={!isAdmin} required placeholder="Prep, Labeling, Storage" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </Field>
          <Field label="Pricing type">
            <select className={inputClassName} disabled={!isAdmin} value={form.pricing_type} onChange={(event) => setForm({ ...form, pricing_type: event.target.value as PricingType })}>
              {pricingTypes.map((type) => (
                <option key={type} value={type}>
                  {formatPricingType(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default price">
            <input className={inputClassName} disabled={!isAdmin} min="0" step="0.01" type="number" value={form.default_price} onChange={(event) => setForm({ ...form, default_price: event.target.value })} />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Description">
              <textarea className={textAreaClassName} disabled={!isAdmin} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" disabled={!isAdmin} checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" disabled={!isAdmin} checked={form.visible_to_client} onChange={(event) => setForm({ ...form, visible_to_client: event.target.checked })} />
              Visible to client
            </label>
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" disabled={!isAdmin || saving}>
              {saving ? "Saving..." : "Save service"}
            </Button>
            <Link href="/services" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}

export function formatPricingType(type: PricingType | string) {
  return type.replaceAll("_", " ");
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
