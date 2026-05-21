"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
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

type Service = Tables<"services">;
type PricingType = Service["pricing_type"];

const pricingTypes: PricingType[] = [
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

export function ServicesClient() {
  const { role } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editing, setEditing] = useState<Service | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const categories = useMemo(
    () => Array.from(new Set(services.map((service) => service.category))).sort(),
    [services],
  );
  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return services.filter((service) => {
      const matchesQuery =
        !normalizedQuery ||
        service.name.toLowerCase().includes(normalizedQuery) ||
        service.category.toLowerCase().includes(normalizedQuery) ||
        service.description?.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        categoryFilter === "all" || service.category === categoryFilter;
      const matchesPricing =
        pricingFilter === "all" || service.pricing_type === pricingFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? service.active : !service.active);

      return matchesQuery && matchesCategory && matchesPricing && matchesStatus;
    });
  }, [categoryFilter, pricingFilter, query, services, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadServices(), 0);

    return () => window.clearTimeout(timeout);
  }, []);

  async function loadServices() {
    setError(null);
    const { data, error: loadError } = await supabase
      .from("services")
      .select("*")
      .is("deleted_at", null)
      .order("category")
      .order("name");

    if (loadError) {
      setError(loadError.message);
    } else {
      setServices(data ?? []);
    }

    setLoading(false);
  }

  function startEdit(service: Service) {
    setEditing(service);
    setForm({
      name: service.name,
      category: service.category,
      description: service.description ?? "",
      pricing_type: service.pricing_type,
      default_price: String(service.default_price),
      active: service.active,
      visible_to_client: service.visible_to_client,
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

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

    const result = editing
      ? await supabase.from("services").update(payload).eq("id", editing.id)
      : await supabase.from("services").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      await loadServices();
    }

    setSaving(false);
  }

  async function deactivateService(service: Service) {
    if (!window.confirm(`Deactivate ${service.name}?`)) {
      return;
    }

    setError(null);
    const { error: updateError } = await supabase
      .from("services")
      .update({ active: false })
      .eq("id", service.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadServices();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Services"
        description="Manage the prep center service catalog and default pricing before service requests are built."
        action={<StatusBadge tone="blue">{services.length} services</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel title="Service catalog" description="Search, filter, edit, and deactivate service definitions.">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input
              className={inputClassName}
              placeholder="Search services"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className={inputClassName}
              value={pricingFilter}
              onChange={(event) => setPricingFilter(event.target.value)}
            >
              <option value="all">All pricing</option>
              {pricingTypes.map((type) => (
                <option key={type} value={type}>
                  {formatPricingType(type)}
                </option>
              ))}
            </select>
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading services..." />
          ) : filteredServices.length === 0 ? (
            <EmptyState title="No services found" body="Create a service or adjust the filters." />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Pricing</th>
                    <th className="px-4 py-3 font-semibold">Default</th>
                    <th className="px-4 py-3 font-semibold">Client visible</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{service.name}</p>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                          {service.description ?? "No description"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{service.category}</td>
                      <td className="px-4 py-3 text-slate-600">{formatPricingType(service.pricing_type)}</td>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {formatMoney(service.default_price)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={service.visible_to_client ? "blue" : "slate"}>
                          {service.visible_to_client ? "Visible" : "Hidden"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={service.active ? "emerald" : "slate"}>
                          {service.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" onClick={() => startEdit(service)} disabled={!isAdmin}>
                            Edit
                          </Button>
                          <Button type="button" variant="danger" onClick={() => void deactivateService(service)} disabled={!isAdmin || !service.active}>
                            Deactivate
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

        <Panel title={editing ? "Edit service" : "Create service"} description={isAdmin ? undefined : "Admin role required to manage services."}>
          <form className="space-y-4" onSubmit={(event) => void saveService(event)}>
            <Field label="Name">
              <input
                className={inputClassName}
                disabled={!isAdmin}
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClassName}
                disabled={!isAdmin}
                required
                placeholder="Prep, Labeling, Storage"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </Field>
            <Field label="Pricing type">
              <select
                className={inputClassName}
                disabled={!isAdmin}
                value={form.pricing_type}
                onChange={(event) =>
                  setForm({ ...form, pricing_type: event.target.value as PricingType })
                }
              >
                {pricingTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatPricingType(type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default price">
              <input
                className={inputClassName}
                disabled={!isAdmin}
                min="0"
                step="0.01"
                type="number"
                value={form.default_price}
                onChange={(event) => setForm({ ...form, default_price: event.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                className={textAreaClassName}
                disabled={!isAdmin}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={form.visible_to_client}
                  onChange={(event) =>
                    setForm({ ...form, visible_to_client: event.target.checked })
                  }
                />
                Visible to client
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!isAdmin || saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create service"}
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

export function formatPricingType(type: PricingType | string) {
  return type.replaceAll("_", " ");
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
