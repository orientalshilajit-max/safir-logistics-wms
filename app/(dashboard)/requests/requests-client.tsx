"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  PageHeader,
  Panel,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";
import { formatMoney, formatPricingType } from "../services/services-client";
import { ActivityTimeline } from "@/app/components/activity-timeline";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku" | "fnsku">;
type InventoryRow = Tables<"inventory"> & {
  clients: Client | null;
  products: Product | null;
};
type Service = Pick<
  Tables<"services">,
  "id" | "name" | "category" | "pricing_type" | "default_price" | "active"
>;
type Override = Pick<
  Tables<"client_pricing_overrides">,
  "client_id" | "service_id" | "override_price" | "active"
>;
type ServiceRequest = Tables<"service_requests"> & {
  clients: Client | null;
  request_items: { id: string }[];
  request_boxes: { id: string }[];
};

type RequestLine = {
  localId: string;
  inventory_id: string;
  requested_quantity: string;
  service_ids: string[];
  notes: string;
};

type RequestBox = {
  localId: string;
  box_number: string;
  tracking_number: string;
  uploaded_label_url: string;
  items: Record<string, string>;
};

type RequestForm = {
  client_id: string;
  carrier: string;
  tracking_numbers: string;
  box_count: string;
  shipping_label_urls: string;
  notes: string;
  lines: RequestLine[];
  boxes: RequestBox[];
};

const requestStatuses: ServiceRequest["status"][] = [
  "Draft",
  "Submitted",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Waiting Labels",
  "Ready for Prep",
  "Prep in Progress",
  "QC Check",
  "Packing",
  "Ready to Ship",
  "Shipped",
  "Completed",
  "On Hold",
  "Need Client Action",
];

const newLocalId = () => crypto.randomUUID();

const newLine = (): RequestLine => ({
  localId: newLocalId(),
  inventory_id: "",
  requested_quantity: "1",
  service_ids: [],
  notes: "",
});

const emptyForm = (): RequestForm => ({
  client_id: "",
  carrier: "",
  tracking_numbers: "",
  box_count: "0",
  shipping_label_urls: "",
  notes: "",
  lines: [newLine()],
  boxes: [],
});

export function RequestsClient() {
  const { clientId, role, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [form, setForm] = useState<RequestForm>(() => emptyForm());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const selectedClientId = isAdmin ? form.client_id : clientId;
  const clientInventory = useMemo(
    () =>
      inventory.filter(
        (row) => row.client_id === selectedClientId && row.available_qty > 0,
      ),
    [inventory, selectedClientId],
  );
  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      const matchesQuery =
        !normalized ||
        request.request_number.toLowerCase().includes(normalized) ||
        request.clients?.company_name.toLowerCase().includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [query, requests, statusFilter]);
  const estimatedTotal = useMemo(
    () => calculateEstimate(form, inventory, services, overrides, selectedClientId),
    [form, inventory, overrides, selectedClientId, services],
  );

  const loadData = useCallback(async () => {
    setError(null);

    const [clientsResult, inventoryResult, servicesResult, overridesResult, requestsResult] =
      await Promise.all([
        supabase.from("clients").select("id, company_name").is("deleted_at", null).order("company_name"),
        supabase
          .from("inventory")
          .select("*, clients(id, company_name), products(id, product_name, sku, fnsku)")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("services")
          .select("id, name, category, pricing_type, default_price, active")
          .is("deleted_at", null)
          .eq("active", true)
          .order("category")
          .order("name"),
        supabase
          .from("client_pricing_overrides")
          .select("client_id, service_id, override_price, active")
          .is("deleted_at", null)
          .eq("active", true),
        supabase
          .from("service_requests")
          .select("*, clients(id, company_name), request_items(id), request_boxes(id)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (inventoryResult.error) setError(inventoryResult.error.message);
    else setInventory((inventoryResult.data ?? []) as InventoryRow[]);

    if (servicesResult.error) setError(servicesResult.error.message);
    else setServices(servicesResult.data ?? []);

    if (overridesResult.error) setError(overridesResult.error.message);
    else setOverrides(overridesResult.data ?? []);

    if (requestsResult.error) setError(requestsResult.error.message);
    else {
      const loadedRequests = (requestsResult.data ?? []) as ServiceRequest[];
      setRequests(loadedRequests);
      setSelectedRequestId((current) => current ?? loadedRequests[0]?.id ?? null);
    }

    if (!isAdmin && clientId) {
      setForm((current) => ({ ...current, client_id: clientId }));
    }

    setLoading(false);
  }, [clientId, isAdmin]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  function updateLine(localId: string, patch: Partial<RequestLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.localId === localId ? { ...line, ...patch } : line,
      ),
    }));
  }

  function updateBox(localId: string, patch: Partial<RequestBox>) {
    setForm((current) => ({
      ...current,
      boxes: current.boxes.map((box) =>
        box.localId === localId ? { ...box, ...patch } : box,
      ),
    }));
  }

  function addBox() {
    setForm((current) => ({
      ...current,
      box_count: String(current.boxes.length + 1),
      boxes: [
        ...current.boxes,
        {
          localId: newLocalId(),
          box_number: String(current.boxes.length + 1),
          tracking_number: "",
          uploaded_label_url: "",
          items: {},
        },
      ],
    }));
  }

  async function createAndSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const client_id = selectedClientId;

    if (!client_id) {
      setError("Select a client before submitting a request.");
      setSaving(false);
      return;
    }

    const validationError = validateRequest(form, inventory, client_id);

    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    const { data: request, error: requestError } = await supabase
      .from("service_requests")
      .insert({
        client_id,
        carrier: form.carrier.trim() || null,
        tracking_numbers: splitTextList(form.tracking_numbers),
        box_count: Number(form.box_count) || form.boxes.length,
        shipping_label_urls: splitTextList(form.shipping_label_urls),
        notes: form.notes.trim() || null,
        estimated_total: estimatedTotal,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (requestError || !request) {
      setError(requestError?.message ?? "Unable to create service request.");
      setSaving(false);
      return;
    }

    const itemIdsByLocalId = new Map<string, string>();

    for (const line of form.lines.filter((item) => item.inventory_id)) {
      const inventoryRow = inventory.find((row) => row.id === line.inventory_id);
      if (!inventoryRow) continue;

      const { data: requestItem, error: itemError } = await supabase
        .from("request_items")
        .insert({
          request_id: request.id,
          inventory_id: inventoryRow.id,
          product_id: inventoryRow.product_id,
          fnsku: inventoryRow.products?.fnsku ?? null,
          requested_quantity: Number(line.requested_quantity) || 0,
          notes: line.notes.trim() || null,
        })
        .select("id")
        .single();

      if (itemError || !requestItem) {
        setError(itemError?.message ?? "Unable to create request item.");
        setSaving(false);
        return;
      }

      itemIdsByLocalId.set(line.localId, requestItem.id);

      const serviceRows = buildRequestItemServices(
        line,
        requestItem.id,
        services,
        overrides,
        client_id,
        Number(form.box_count) || form.boxes.length,
      );

      if (serviceRows.length > 0) {
        const { error: servicesError } = await supabase
          .from("request_item_services")
          .insert(serviceRows);

        if (servicesError) {
          setError(servicesError.message);
          setSaving(false);
          return;
        }
      }
    }

    for (const box of form.boxes) {
      const { data: requestBox, error: boxError } = await supabase
        .from("request_boxes")
        .insert({
          request_id: request.id,
          box_number: Number(box.box_number) || 1,
          tracking_number: box.tracking_number.trim() || null,
          uploaded_label_url: box.uploaded_label_url.trim() || null,
        })
        .select("id")
        .single();

      if (boxError || !requestBox) {
        setError(boxError?.message ?? "Unable to create box.");
        setSaving(false);
        return;
      }

      const boxItems = Object.entries(box.items)
        .map(([lineLocalId, quantity]) => {
          const requestItemId = itemIdsByLocalId.get(lineLocalId);
          const line = form.lines.find((item) => item.localId === lineLocalId);
          const inventoryRow = inventory.find((row) => row.id === line?.inventory_id);

          if (!requestItemId || !inventoryRow || Number(quantity) <= 0) {
            return null;
          }

          return {
            request_box_id: requestBox.id,
            request_item_id: requestItemId,
            product_id: inventoryRow.product_id,
            quantity: Number(quantity),
          };
        })
        .filter(Boolean) as {
        request_box_id: string;
        request_item_id: string;
        product_id: string;
        quantity: number;
      }[];

      if (boxItems.length > 0) {
        const { error: boxItemsError } = await supabase
          .from("request_box_items")
          .insert(boxItems);

        if (boxItemsError) {
          setError(boxItemsError.message);
          setSaving(false);
          return;
        }
      }
    }

    const { error: submitError } = await supabase.rpc("submit_service_request", {
      p_request_id: request.id,
    });

    if (submitError) {
      setError(submitError.message);
    } else {
      setForm(emptyForm());
      await loadData();
    }

    setSaving(false);
  }

  async function updateRequestStatus(
    request: ServiceRequest,
    status: ServiceRequest["status"],
  ) {
    setError(null);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        status,
        approved_at: status === "Approved" ? now : request.approved_at,
        rejected_at: status === "Rejected" ? now : request.rejected_at,
      })
      .eq("id", request.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadData();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Client Work"
        title="Service Requests"
        description="Create service requests from available inventory, estimate service costs, and reserve stock when submitted."
        action={<StatusBadge tone="blue">{requests.length} requests</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_34rem]">
        <Panel title="Requests" description="Submitted requests require admin approval before work starts.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <input
              className={inputClassName}
              placeholder="Search request or client"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {requestStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading service requests...</p>
          ) : filteredRequests.length === 0 ? (
            <EmptyState title="No service requests found" body="Create a request from available inventory to begin." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Items</th>
                    <th className="px-4 py-3 font-semibold">Boxes</th>
                    <th className="px-4 py-3 font-semibold">Estimate</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Admin actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedRequestId(request.id)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {request.request_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {request.clients?.company_name ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{request.request_items.length}</td>
                      <td className="px-4 py-3 text-slate-600">{request.request_boxes.length}</td>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {formatMoney(request.estimated_total)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone(request.status)}>{request.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!isAdmin}
                            onClick={() => void updateRequestStatus(request, "Approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={!isAdmin}
                            onClick={() => void updateRequestStatus(request, "Rejected")}
                          >
                            Reject
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!isAdmin}
                            onClick={() => void updateRequestStatus(request, "Need Client Action")}
                          >
                            Request changes
                          </Button>
                          <Button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => void updateRequestStatus(request, "Completed")}
                          >
                            Complete
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

        <div className="space-y-5">
          <Panel title="Create request" description="Quantities are reserved from available inventory when submitted.">
            <form className="space-y-5" onSubmit={(event) => void createAndSubmitRequest(event)}>
            {isAdmin ? (
              <Field label="Client">
                <select
                  className={inputClassName}
                  required
                  value={form.client_id}
                  onChange={(event) =>
                    setForm({ ...form, client_id: event.target.value, lines: [newLine()], boxes: [] })
                  }
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Carrier">
                <input
                  className={inputClassName}
                  value={form.carrier}
                  onChange={(event) => setForm({ ...form, carrier: event.target.value })}
                />
              </Field>
              <Field label="Box count">
                <input
                  className={inputClassName}
                  min="0"
                  type="number"
                  value={form.box_count}
                  onChange={(event) => setForm({ ...form, box_count: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Tracking numbers">
              <textarea
                className={textAreaClassName}
                placeholder="One per line or comma separated"
                value={form.tracking_numbers}
                onChange={(event) =>
                  setForm({ ...form, tracking_numbers: event.target.value })
                }
              />
            </Field>
            <Field label="Shipping label URLs">
              <textarea
                className={textAreaClassName}
                placeholder="One per line or comma separated"
                value={form.shipping_label_urls}
                onChange={(event) =>
                  setForm({ ...form, shipping_label_urls: event.target.value })
                }
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Products</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}
                  disabled={!selectedClientId}
                >
                  Add product
                </Button>
              </div>
              {form.lines.map((line) => {
                const row = inventory.find((item) => item.id === line.inventory_id);
                return (
                  <div key={line.localId} className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                    <Field label="Inventory product">
                      <select
                        className={inputClassName}
                        required
                        value={line.inventory_id}
                        onChange={(event) =>
                          updateLine(line.localId, { inventory_id: event.target.value })
                        }
                      >
                        <option value="">Select product</option>
                        {clientInventory.map((inventoryRow) => (
                          <option key={inventoryRow.id} value={inventoryRow.id}>
                            {inventoryRow.products?.product_name ?? "Unknown"} - available {inventoryRow.available_qty}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {row ? (
                      <p className="text-xs font-medium text-slate-500">
                        FNSKU: {row.products?.fnsku ?? "-"} · SKU: {row.products?.sku ?? "-"} · Available: {row.available_qty}
                      </p>
                    ) : null}
                    <Field label="Requested quantity">
                      <input
                        className={inputClassName}
                        min="1"
                        max={row?.available_qty}
                        required
                        type="number"
                        value={line.requested_quantity}
                        onChange={(event) =>
                          updateLine(line.localId, { requested_quantity: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Services">
                      <div className="grid gap-2 rounded-md border border-slate-200 p-3">
                        {services.map((service) => (
                          <label key={service.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={line.service_ids.includes(service.id)}
                                onChange={(event) => {
                                  updateLine(line.localId, {
                                    service_ids: event.target.checked
                                      ? [...line.service_ids, service.id]
                                      : line.service_ids.filter((id) => id !== service.id),
                                  });
                                }}
                              />
                              <span className="font-medium text-slate-700">{service.name}</span>
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatMoney(getServicePrice(service, overrides, selectedClientId))} · {formatPricingType(service.pricing_type)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field label="Line notes">
                      <input
                        className={inputClassName}
                        value={line.notes}
                        onChange={(event) =>
                          updateLine(line.localId, { notes: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Boxes</p>
                <Button type="button" variant="secondary" onClick={addBox}>
                  Add box
                </Button>
              </div>
              {form.boxes.length === 0 ? (
                <p className="text-sm text-slate-500">Box details can be added now or later.</p>
              ) : null}
              {form.boxes.map((box) => (
                <div key={box.localId} className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Box number">
                      <input className={inputClassName} min="1" type="number" value={box.box_number} onChange={(event) => updateBox(box.localId, { box_number: event.target.value })} />
                    </Field>
                    <Field label="Tracking number">
                      <input className={inputClassName} value={box.tracking_number} onChange={(event) => updateBox(box.localId, { tracking_number: event.target.value })} />
                    </Field>
                    <Field label="Uploaded label URL">
                      <input className={inputClassName} value={box.uploaded_label_url} onChange={(event) => updateBox(box.localId, { uploaded_label_url: event.target.value })} />
                    </Field>
                  </div>
                  <div className="grid gap-2">
                    {form.lines.map((line) => {
                      const row = inventory.find((item) => item.id === line.inventory_id);
                      return (
                        <Field key={line.localId} label={`${row?.products?.product_name ?? "Product"} quantity in box`}>
                          <input
                            className={inputClassName}
                            min="0"
                            type="number"
                            value={box.items[line.localId] ?? ""}
                            onChange={(event) =>
                              updateBox(box.localId, {
                                items: { ...box.items, [line.localId]: event.target.value },
                              })
                            }
                          />
                        </Field>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Field label="Request notes">
              <textarea
                className={textAreaClassName}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Estimated total</p>
              <p className="mt-2 text-2xl font-semibold text-blue-950">
                {formatMoney(estimatedTotal)}
              </p>
              <p className="mt-1 text-xs font-medium text-blue-700">
                Client overrides are used when active; otherwise catalog defaults apply.
              </p>
            </div>

              <Button type="submit" disabled={saving || !selectedClientId}>
                {saving ? "Submitting..." : "Create and submit request"}
              </Button>
            </form>
          </Panel>
          <ActivityTimeline
            entityType="service_requests"
            entityId={selectedRequestId}
            title="Request activity"
          />
        </div>
      </div>
    </div>
  );
}

function splitTextList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getServicePrice(
  service: Service,
  overrides: Override[],
  clientId: string | null | undefined,
) {
  const override = overrides.find(
    (item) => item.client_id === clientId && item.service_id === service.id && item.active,
  );

  return override?.override_price ?? service.default_price ?? 0;
}

function serviceQuantityBasis(
  pricingType: Service["pricing_type"],
  requestedQuantity: number,
  boxCount: number,
) {
  switch (pricingType) {
    case "per_unit":
      return requestedQuantity;
    case "per_box":
      return boxCount;
    default:
      return 1;
  }
}

function calculateEstimate(
  form: RequestForm,
  inventory: InventoryRow[],
  services: Service[],
  overrides: Override[],
  clientId: string | null | undefined,
) {
  const boxCount = Number(form.box_count) || form.boxes.length || 1;

  return form.lines.reduce((total, line) => {
    const quantity = Number(line.requested_quantity) || 0;
    const inventoryRow = inventory.find((row) => row.id === line.inventory_id);

    if (!inventoryRow) {
      return total;
    }

    const lineTotal = line.service_ids.reduce((serviceTotal, serviceId) => {
      const service = services.find((item) => item.id === serviceId);
      if (!service) return serviceTotal;

      const price = getServicePrice(service, overrides, clientId);
      const basis = serviceQuantityBasis(service.pricing_type, quantity, boxCount);
      return serviceTotal + price * basis;
    }, 0);

    return total + lineTotal;
  }, 0);
}

function buildRequestItemServices(
  line: RequestLine,
  requestItemId: string,
  services: Service[],
  overrides: Override[],
  clientId: string,
  boxCount: number,
) {
  const requestedQuantity = Number(line.requested_quantity) || 0;

  return line.service_ids
    .map((serviceId) => {
      const service = services.find((item) => item.id === serviceId);
      if (!service) return null;

      const unitPrice = getServicePrice(service, overrides, clientId);
      const quantityBasis = serviceQuantityBasis(
        service.pricing_type,
        requestedQuantity,
        boxCount || 1,
      );

      return {
        request_item_id: requestItemId,
        service_id: service.id,
        pricing_type: service.pricing_type,
        unit_price: unitPrice,
        quantity_basis: quantityBasis,
        estimated_total: unitPrice * quantityBasis,
      };
    })
    .filter(Boolean) as {
    request_item_id: string;
    service_id: string;
    pricing_type: string;
    unit_price: number;
    quantity_basis: number;
    estimated_total: number;
  }[];
}

function validateRequest(
  form: RequestForm,
  inventory: InventoryRow[],
  clientId: string,
) {
  const lines = form.lines.filter((line) => line.inventory_id);

  if (lines.length === 0) {
    return "Add at least one product.";
  }

  for (const line of lines) {
    const inventoryRow = inventory.find((row) => row.id === line.inventory_id);
    const quantity = Number(line.requested_quantity) || 0;

    if (!inventoryRow || inventoryRow.client_id !== clientId) {
      return "Selected inventory does not belong to the request client.";
    }

    if (quantity <= 0) {
      return "Requested quantity must be greater than 0.";
    }

    if (quantity > inventoryRow.available_qty) {
      return `Requested quantity for ${inventoryRow.products?.product_name ?? "a product"} exceeds available inventory.`;
    }
  }

  return null;
}

function statusTone(status: ServiceRequest["status"]) {
  if (status === "Approved" || status === "Completed" || status === "Shipped") {
    return "emerald";
  }

  if (status === "Rejected" || status === "On Hold" || status === "Need Client Action") {
    return "rose";
  }

  if (status === "Pending Approval" || status === "Waiting Labels") {
    return "amber";
  }

  return "blue";
}
