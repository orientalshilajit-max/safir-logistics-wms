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
  Panel,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";
import { formatMoney, formatPricingType } from "../services/service-form-client";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Service = Pick<
  Tables<"services">,
  "id" | "name" | "category" | "pricing_type" | "default_price" | "active"
>;
type Override = Tables<"client_pricing_overrides"> & {
  clients: Client | null;
  services: Service | null;
};

type OverrideForm = {
  client_id: string;
  service_id: string;
  override_price: string;
  active: boolean;
  notes: string;
};

const emptyForm: OverrideForm = {
  client_id: "",
  service_id: "",
  override_price: "0.00",
  active: true,
  notes: "",
};

export function ClientPricingOverridesClient() {
  const { role } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [form, setForm] = useState<OverrideForm>(emptyForm);
  const [editing, setEditing] = useState<Override | null>(null);
  const [clientFilter, setClientFilter] = useState("all");
  const [serviceQuery, setServiceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const filteredRows = useMemo(() => {
    const normalizedQuery = serviceQuery.trim().toLowerCase();

    return overrides.filter((override) => {
      const service = override.services;
      const matchesClient = clientFilter === "all" || override.client_id === clientFilter;
      const matchesService =
        !normalizedQuery ||
        service?.name.toLowerCase().includes(normalizedQuery) ||
        service?.category.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? override.active : !override.active);

      return matchesClient && matchesService && matchesStatus;
    });
  }, [clientFilter, overrides, serviceQuery, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, []);

  async function loadData() {
    setError(null);

    const [clientsResult, servicesResult, overridesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name"),
      supabase
        .from("services")
        .select("id, name, category, pricing_type, default_price, active")
        .is("deleted_at", null)
        .order("category")
        .order("name"),
      supabase
        .from("client_pricing_overrides")
        .select(
          "*, clients(id, company_name), services(id, name, category, pricing_type, default_price, active)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (servicesResult.error) setError(servicesResult.error.message);
    else setServices(servicesResult.data ?? []);

    if (overridesResult.error) setError(overridesResult.error.message);
    else setOverrides((overridesResult.data ?? []) as Override[]);

    setLoading(false);
  }

  function startEdit(override: Override) {
    setEditing(override);
    setForm({
      client_id: override.client_id,
      service_id: override.service_id,
      override_price: String(override.override_price),
      active: override.active,
      notes: override.notes ?? "",
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    const overridePrice = Number(form.override_price);

    if (!form.client_id || !form.service_id) {
      setError("Client and service are required.");
      return;
    }

    if (!Number.isFinite(overridePrice) || overridePrice < 0) {
      setError("Override price must be zero or greater.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      client_id: form.client_id,
      service_id: form.service_id,
      override_price: overridePrice,
      active: form.active,
      notes: form.notes.trim() || null,
    };

    const result = editing
      ? await supabase.from("client_pricing_overrides").update(payload).eq("id", editing.id)
      : await supabase.from("client_pricing_overrides").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      await loadData();
    }

    setSaving(false);
  }

  async function deactivateOverride(override: Override) {
    if (
      !window.confirm(
        `Deactivate override for ${override.clients?.company_name ?? "this client"}?`,
      )
    ) {
      return;
    }

    setError(null);
    const { error: updateError } = await supabase
      .from("client_pricing_overrides")
      .update({ active: false })
      .eq("id", override.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadData();
    }
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="xl:col-span-2">
          <StatusBadge tone="blue">{overrides.length} overrides</StatusBadge>
        </div>
        <Panel title="Overrides" description="Client-specific prices take priority over service defaults.">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select
              className={inputClassName}
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </select>
            <input
              className={inputClassName}
              placeholder="Search service"
              value={serviceQuery}
              onChange={(event) => setServiceQuery(event.target.value)}
            />
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
            <LoadingState label="Loading pricing overrides..." />
          ) : filteredRows.length === 0 ? (
            <EmptyState title="No overrides found" body="Create a client-specific price or adjust the filters." />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[960px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Pricing</th>
                    <th className="px-4 py-3 font-semibold">Default</th>
                    <th className="px-4 py-3 font-semibold">Override</th>
                    <th className="px-4 py-3 font-semibold">Effective</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((override) => {
                    const defaultPrice = override.services?.default_price ?? 0;
                    const effectivePrice = override.active ? override.override_price : defaultPrice;

                    return (
                      <tr key={override.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-950">
                          {override.clients?.company_name ?? "Unknown client"}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-950">
                            {override.services?.name ?? "Unknown service"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {override.services?.category ?? "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatPricingType(override.services?.pricing_type ?? "manual")}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(defaultPrice)}</td>
                        <td className="px-4 py-3 font-medium text-slate-950">
                          {formatMoney(override.override_price)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-slate-950">
                              {formatMoney(effectivePrice)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {override.active ? "Override price" : "Default price"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={override.active ? "emerald" : "slate"}>
                            {override.active ? "Active" : "Inactive"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={() => startEdit(override)} disabled={!isAdmin}>
                              Edit
                            </Button>
                            <Button type="button" variant="danger" onClick={() => void deactivateOverride(override)} disabled={!isAdmin || !override.active}>
                              Deactivate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={editing ? "Edit override" : "Create override"} description={isAdmin ? undefined : "Admin role required to manage pricing overrides."}>
          <form className="space-y-4" onSubmit={(event) => void saveOverride(event)}>
            <Field label="Client">
              <select
                className={inputClassName}
                disabled={!isAdmin}
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
            <Field label="Service">
              <select
                className={inputClassName}
                disabled={!isAdmin}
                required
                value={form.service_id}
                onChange={(event) => {
                  const service = services.find((item) => item.id === event.target.value);
                  setForm({
                    ...form,
                    service_id: event.target.value,
                    override_price: service ? String(service.default_price) : form.override_price,
                  });
                }}
              >
                <option value="">Select service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} - {formatMoney(service.default_price)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Override price">
              <input
                className={inputClassName}
                disabled={!isAdmin}
                min="0"
                step="0.01"
                type="number"
                value={form.override_price}
                onChange={(event) => setForm({ ...form, override_price: event.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={textAreaClassName}
                disabled={!isAdmin}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Active override
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={!isAdmin || saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create override"}
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
