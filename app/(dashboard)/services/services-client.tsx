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
import { formatMoney, formatPricingType, pricingTypes } from "./service-form-client";

type Service = Tables<"services">;

export function ServicesClient() {
  const { role } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [loading, setLoading] = useState(true);
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

  const loadServices = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadServices(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadServices]);

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
      <ErrorBanner message={error} />

      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge tone="blue">{services.length} services</StatusBadge>
          {isAdmin ? (
            <Link
              href="/services/new"
              className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <span className="mr-2 text-base leading-none">+</span>
              Add Service
            </Link>
          ) : null}
        </div>
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
                          <Link
                            href={`/services/${service.id}/edit`}
                            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            aria-disabled={!isAdmin}
                          >
                            Edit
                          </Link>
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
      </div>
    </div>
  );
}
