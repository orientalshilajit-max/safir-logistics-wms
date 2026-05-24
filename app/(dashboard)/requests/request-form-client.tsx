"use client";

import {
  type Dispatch,
  FormEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
type RequestItem = Pick<
  Tables<"request_items">,
  "id" | "inventory_id" | "product_id" | "requested_quantity" | "notes" | "fnsku"
> & {
  request_item_services: Pick<Tables<"request_item_services">, "id" | "service_id">[];
};
type ServiceRequest = Tables<"service_requests"> & {
  request_items: RequestItem[];
};

type RequestType =
  | "FBA Prep"
  | "FBM Fulfillment"
  | "Storage"
  | "Forwarding"
  | "Inspection"
  | "Bundle Creation"
  | "Returns";

type RequestForm = {
  client_id: string;
  inventory_id: string;
  requested_quantity: string;
  request_type: RequestType | "";
  service_ids: string[];
  carrier: string;
  tracking_numbers: string;
  box_count: string;
  shipping_label_urls: string;
  notes: string;
  fnsku: string;
  asin: string;
  amazon_shipment_id: string;
  marketplace: string;
  order_number: string;
  ship_to_address: string;
  shipping_method: string;
  packaging_instructions: string;
  storage_duration: string;
  destination_address: string;
  inspection_instructions: string;
  photo_report: boolean;
  bundle_instructions: string;
  bundle_components: string;
  bundle_quantity: string;
  labeling_requirements: string;
  return_reason: string;
  condition_notes: string;
  next_action: string;
  estimated_total_override: string;
};

const requestTypes: RequestType[] = [
  "FBA Prep",
  "FBM Fulfillment",
  "Storage",
  "Forwarding",
  "Inspection",
  "Bundle Creation",
  "Returns",
];

const emptyForm = (): RequestForm => ({
  client_id: "",
  inventory_id: "",
  requested_quantity: "1",
  request_type: "",
  service_ids: [],
  carrier: "",
  tracking_numbers: "",
  box_count: "0",
  shipping_label_urls: "",
  notes: "",
  fnsku: "",
  asin: "",
  amazon_shipment_id: "",
  marketplace: "",
  order_number: "",
  ship_to_address: "",
  shipping_method: "",
  packaging_instructions: "",
  storage_duration: "",
  destination_address: "",
  inspection_instructions: "",
  photo_report: false,
  bundle_instructions: "",
  bundle_components: "",
  bundle_quantity: "",
  labeling_requirements: "",
  return_reason: "",
  condition_notes: "",
  next_action: "",
  estimated_total_override: "",
});

export function RequestFormClient({ requestId }: { requestId?: string }) {
  const router = useRouter();
  const { clientId, role, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [existingRequest, setExistingRequest] = useState<ServiceRequest | null>(null);
  const [form, setForm] = useState<RequestForm>(() => emptyForm());
  const [productSearch, setProductSearch] = useState("");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [shippingLabelFiles, setShippingLabelFiles] = useState<File[]>([]);
  const [boxLabelFiles, setBoxLabelFiles] = useState<File[]>([]);
  const [supportFiles, setSupportFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isEditMode = Boolean(requestId);
  const selectedClientId = isAdmin ? form.client_id : clientId;
  const selectedInventory = inventory.find((row) => row.id === form.inventory_id) ?? null;
  const selectedService = useMemo(
    () => findServiceForRequestType(services, form.request_type),
    [form.request_type, services],
  );
  const clientInventory = useMemo(
    () => {
      if (existingRequest) {
        return inventory.filter((row) => row.id === form.inventory_id);
      }

      return inventory.filter(
        (row) => row.client_id === selectedClientId && row.available_qty > 0,
      );
    },
    [existingRequest, form.inventory_id, inventory, selectedClientId],
  );
  const filteredInventory = useMemo(() => {
    const normalized = productSearch.trim().toLowerCase();

    return clientInventory.filter((row) => {
      if (!normalized) return true;
      return (
        row.products?.product_name.toLowerCase().includes(normalized) ||
        row.products?.sku?.toLowerCase().includes(normalized) ||
        row.products?.fnsku?.toLowerCase().includes(normalized)
      );
    });
  }, [clientInventory, productSearch]);
  const requestedQuantity = Number(form.requested_quantity) || 0;
  const hasSelectedProduct = Boolean(selectedInventory);
  const hasValidQuantity =
    Boolean(selectedInventory) &&
    Number.isInteger(requestedQuantity) &&
    requestedQuantity > 0 &&
    requestedQuantity <= availableForSelectedInventory(selectedInventory, existingRequest);
  const hasSelectedRequestType = Boolean(form.request_type);
  const calculatedTotal = useMemo(
    () => calculateEstimate(form, services, overrides, selectedClientId),
    [form, overrides, selectedClientId, services],
  );
  const estimatedTotal = Number(form.estimated_total_override) || calculatedTotal;
  const selectedServices = services.filter((service) => form.service_ids.includes(service.id));
  const canEditRequest =
    !existingRequest ||
    isAdmin ||
    ["Draft", "Submitted", "Need Client Action"].includes(existingRequest.status);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);

    const clientsQuery = supabase
      .from("clients")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name");
    const inventoryQuery = supabase
      .from("inventory")
      .select("*, clients(id, company_name), products!inventory_product_id_fkey(id, product_name, sku, fnsku)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    const servicesQuery = supabase
      .from("services")
      .select("id, name, category, pricing_type, default_price, active")
      .is("deleted_at", null)
      .eq("active", true)
      .order("category")
      .order("name");
    const overridesQuery = supabase
      .from("client_pricing_overrides")
      .select("client_id, service_id, override_price, active")
      .is("deleted_at", null)
      .eq("active", true);

    if (role === "client" && clientId) {
      clientsQuery.eq("id", clientId);
      inventoryQuery.eq("client_id", clientId);
      overridesQuery.eq("client_id", clientId);
    }

    const [clientsResult, inventoryResult, servicesResult, overridesResult] =
      await Promise.all([clientsQuery, inventoryQuery, servicesQuery, overridesQuery]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (inventoryResult.error) setError(inventoryResult.error.message);
    else setInventory((inventoryResult.data ?? []) as InventoryRow[]);

    if (servicesResult.error) setError(servicesResult.error.message);
    else setServices(servicesResult.data ?? []);

    if (overridesResult.error) setError(overridesResult.error.message);
    else setOverrides(overridesResult.data ?? []);

    if (requestId) {
      const { data: request, error: requestError } = await supabase
        .from("service_requests")
        .select("*, request_items(id, inventory_id, product_id, requested_quantity, notes, fnsku, request_item_services(id, service_id))")
        .eq("id", requestId)
        .is("deleted_at", null)
        .single();

      if (requestError || !request) {
        setError(requestError?.message ?? "Unable to load request.");
      } else {
        const typedRequest = request as ServiceRequest;
        setExistingRequest(typedRequest);
        setForm(formFromRequest(typedRequest));
      }
    } else if (role === "client" && clientId) {
      setForm((current) => ({ ...current, client_id: clientId }));
    }

    setLoading(false);
  }, [clientId, requestId, role]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  function selectInventoryRow(row: InventoryRow) {
    setForm((current) => ({
      ...current,
      inventory_id: row.id,
      fnsku: current.fnsku || row.products?.fnsku || "",
      requested_quantity: String(
        Math.max(Math.min(Number(current.requested_quantity) || 1, row.available_qty), 1),
      ),
    }));
  }

  function selectRequestType(requestType: RequestType) {
    const matchingService = findServiceForRequestType(services, requestType);

    setForm((current) => ({
      ...current,
      request_type: requestType,
      service_ids: matchingService ? [matchingService.id] : [],
    }));
  }

  function toggleAddOnService(serviceId: string, checked: boolean) {
    const requiredServiceIds = selectedService ? [selectedService.id] : [];
    const nextServices = checked
      ? Array.from(new Set([...form.service_ids, serviceId, ...requiredServiceIds]))
      : form.service_ids.filter((id) => id !== serviceId || requiredServiceIds.includes(id));

    setForm((current) => ({ ...current, service_ids: nextServices }));
  }

  async function saveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    const client_id = selectedClientId;

    if (!client_id) {
      setError("Select a client before submitting a request.");
      setSaving(false);
      return;
    }

    const normalizedForm = normalizeRequestForm(form, selectedService);
    const validationError = validateRequest(normalizedForm, selectedInventory, existingRequest, client_id);

    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    const inventoryError = await revalidateInventory(normalizedForm, existingRequest, client_id);

    if (inventoryError) {
      setError(inventoryError);
      setSaving(false);
      return;
    }

    const result = existingRequest
      ? await updateExistingRequest(normalizedForm, existingRequest, client_id)
      : await createRequest(normalizedForm, client_id);

    if (result) {
      setError(result);
      setSaving(false);
      return;
    }

    router.push("/requests");
    router.refresh();
  }

  async function createRequest(requestForm: RequestForm, client_id: string) {
    const { data: request, error: requestError } = await supabase
      .from("service_requests")
      .insert({
        client_id,
        carrier: requestForm.carrier.trim() || null,
        tracking_numbers: splitTextList(requestForm.tracking_numbers),
        box_count: Number(requestForm.box_count) || 0,
        shipping_label_urls: splitTextList(requestForm.shipping_label_urls),
        notes: buildRequestNotes(requestForm),
        estimated_total: estimatedTotal,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (requestError || !request) {
      return requestError?.message ?? "Unable to create request.";
    }

    const inventoryRow = inventory.find((row) => row.id === requestForm.inventory_id);
    if (!inventoryRow) return "Selected inventory is no longer available.";

    const { data: requestItem, error: itemError } = await supabase
      .from("request_items")
      .insert({
        request_id: request.id,
        inventory_id: inventoryRow.id,
        product_id: inventoryRow.product_id,
        fnsku: requestForm.fnsku.trim() || inventoryRow.products?.fnsku || null,
        requested_quantity: Number(requestForm.requested_quantity),
        notes: requestForm.notes.trim() || null,
      })
      .select("id")
      .single();

    if (itemError || !requestItem) {
      return itemError?.message ?? "Unable to create request item.";
    }

    const serviceRows = buildRequestItemServices(
      requestForm,
      requestItem.id,
      services,
      overrides,
      client_id,
    );

    if (serviceRows.length > 0) {
      const { error: servicesError } = await supabase
        .from("request_item_services")
        .insert(serviceRows);

      if (servicesError) return servicesError.message;
    }

    const uploadError = await uploadRequestFiles(request.id, client_id);
    if (uploadError) return uploadError;

    const { error: submitError } = await supabase.rpc("submit_service_request", {
      p_request_id: request.id,
    });

    return submitError?.message ?? null;
  }

  async function updateExistingRequest(
    requestForm: RequestForm,
    request: ServiceRequest,
    client_id: string,
  ) {
    if (!isAdmin && !["Draft", "Submitted", "Need Client Action"].includes(request.status)) {
      return "This request can no longer be edited from the client portal.";
    }

    if (
      ["Shipped", "Completed"].includes(request.status) &&
      !window.confirm(`Edit ${request.request_number} after it has moved to ${request.status}?`)
    ) {
      return "Edit cancelled.";
    }

    const item = request.request_items[0];
    if (!item) return "Request item not found.";

    const nextQuantity = Number(requestForm.requested_quantity);
    const quantityDelta = nextQuantity - item.requested_quantity;

    if (quantityDelta !== 0 && request.status !== "Draft") {
      const { error: adjustError } = await supabase.rpc("adjust_inventory_quantities", {
        p_inventory_id: item.inventory_id,
        p_available_delta: -quantityDelta,
        p_reserved_delta: quantityDelta,
        p_processing_delta: 0,
        p_shipped_delta: 0,
        p_damaged_delta: 0,
      });

      if (adjustError) return adjustError.message;
    }

    const { error: requestError } = await supabase
      .from("service_requests")
      .update({
        carrier: requestForm.carrier.trim() || null,
        tracking_numbers: splitTextList(requestForm.tracking_numbers),
        box_count: Number(requestForm.box_count) || 0,
        shipping_label_urls: splitTextList(requestForm.shipping_label_urls),
        notes: buildRequestNotes(requestForm),
        estimated_total: estimatedTotal,
      })
      .eq("id", request.id);

    if (requestError) return requestError.message;

    const inventoryRow = inventory.find((row) => row.id === requestForm.inventory_id);
    if (!inventoryRow) return "Selected inventory is no longer available.";

    const { error: itemError } = await supabase
      .from("request_items")
      .update({
        inventory_id: inventoryRow.id,
        product_id: inventoryRow.product_id,
        fnsku: requestForm.fnsku.trim() || inventoryRow.products?.fnsku || null,
        requested_quantity: nextQuantity,
        notes: requestForm.notes.trim() || null,
      })
      .eq("id", item.id);

    if (itemError) return itemError.message;

    const { error: clearServicesError } = await supabase
      .from("request_item_services")
      .update({ deleted_at: new Date().toISOString() })
      .eq("request_item_id", item.id)
      .is("deleted_at", null);

    if (clearServicesError) return clearServicesError.message;

    const serviceRows = buildRequestItemServices(requestForm, item.id, services, overrides, client_id);

    if (serviceRows.length > 0) {
      const { error: serviceError } = await supabase
        .from("request_item_services")
        .insert(serviceRows);

      if (serviceError) return serviceError.message;
    }

    const uploadError = await uploadRequestFiles(request.id, client_id);
    return uploadError;
  }

  async function revalidateInventory(
    requestForm: RequestForm,
    request: ServiceRequest | null,
    client_id: string,
  ) {
    const { data, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, client_id, available_qty, product_id, products!inventory_product_id_fkey(product_name)")
      .eq("id", requestForm.inventory_id)
      .is("deleted_at", null)
      .single();

    if (inventoryError || !data) {
      return inventoryError?.message ?? "Selected inventory is no longer available.";
    }

    if (data.client_id !== client_id) {
      return "Selected inventory does not belong to this client.";
    }

    const previousQuantity = request?.request_items[0]?.requested_quantity ?? 0;
    const available = data.available_qty + (request && request.status !== "Draft" ? previousQuantity : 0);
    const requested = Number(requestForm.requested_quantity);

    if (requested > available) {
      return `Only ${available} units are available for ${data.products?.product_name ?? "this product"}.`;
    }

    return null;
  }

  async function uploadRequestFiles(request_id: string, client_id: string) {
    const uploadGroups: { files: File[]; labelCategory: "shipping_label" | "fba_box_label" | "misc_document" }[] = [
      { files: shippingLabelFiles, labelCategory: "shipping_label" },
      { files: boxLabelFiles, labelCategory: "fba_box_label" },
      { files: supportFiles, labelCategory: "misc_document" },
    ];

    for (const group of uploadGroups) {
      for (const file of group.files) {
        const storagePath = [
          client_id,
          request_id,
          `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`,
        ].join("/");

        const { error: uploadError } = await supabase.storage
          .from("shipping-labels")
          .upload(storagePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) return uploadError.message;

        const { data: signedUrl } = await supabase.storage
          .from("shipping-labels")
          .createSignedUrl(storagePath, 60 * 60);

        const { error: labelError } = await supabase.from("shipping_labels").insert({
          client_id,
          service_request_id: request_id,
          entity_type: "service_requests",
          entity_id: request_id,
          label_category: group.labelCategory,
          file_name: file.name,
          file_url: signedUrl?.signedUrl ?? storagePath,
          storage_path: storagePath,
          mime_type: file.type || null,
          uploaded_by: user?.id ?? null,
        });

        if (labelError) return labelError.message;
      }
    }

    return null;
  }

  if (loading) {
    return <LoadingState label={isEditMode ? "Loading request..." : "Loading request form..."} />;
  }

  if (!canEditRequest) {
    return (
      <Panel title="Request locked" description="This request can no longer be edited.">
        <Link className="text-sm font-semibold text-blue-700" href={`/requests/${requestId}`}>
          View request
        </Link>
      </Panel>
    );
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void saveRequest(event)}>
      <ErrorBanner message={error} />

      <Panel
        title={isEditMode ? "Edit request" : "Add request"}
        description={isAdmin ? "Select the client first, then build the request from available inventory." : "Create a request from your available inventory."}
      >
        <div className="space-y-5">
          {isAdmin ? (
            <Field label="Client">
              <select
                className={inputClassName}
                required
                disabled={isEditMode}
                value={form.client_id}
                onChange={(event) => {
                  setForm({
                    ...emptyForm(),
                    client_id: event.target.value,
                  });
                  setProductSearch("");
                }}
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

          <WizardSection step="1" title="Choose product" ready={hasSelectedProduct}>
            {!selectedClientId ? (
              <p className="text-sm text-slate-500">Select a client to see available inventory.</p>
            ) : (
              <div className="space-y-3">
                <input
                  className={inputClassName}
                  placeholder="Search products, SKU, or FNSKU"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                />
                {filteredInventory.length === 0 ? (
                  <EmptyState
                    title="No available inventory"
                    body="This client does not have available units ready for a request."
                  />
                ) : (
                  <div className="grid gap-2">
                    {filteredInventory.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={`rounded-lg border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                          form.inventory_id === row.id
                            ? "border-blue-300 bg-blue-50"
                            : "border-slate-200 bg-white"
                        }`}
                        onClick={() => selectInventoryRow(row)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">
                              {row.products?.product_name ?? "Unknown product"}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              SKU {row.products?.sku ?? "-"} · FNSKU {row.products?.fnsku ?? "-"}
                            </p>
                          </div>
                          <StatusBadge tone="emerald">
                            {availableForSelectedInventory(row, existingRequest)} available
                          </StatusBadge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </WizardSection>

          {hasSelectedProduct ? (
            <WizardSection step="2" title="Choose quantity" ready={hasValidQuantity}>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {selectedInventory?.products?.product_name ?? "Selected product"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {availableForSelectedInventory(selectedInventory, existingRequest)} units available
                  </p>
                </div>
                <Field label="Requested quantity">
                  <input
                    className={inputClassName}
                    min="1"
                    max={availableForSelectedInventory(selectedInventory, existingRequest)}
                    required
                    type="number"
                    value={form.requested_quantity}
                    onChange={(event) =>
                      setForm({ ...form, requested_quantity: event.target.value })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      requested_quantity: String(
                        availableForSelectedInventory(selectedInventory, existingRequest),
                      ),
                    })
                  }
                >
                  All units
                </Button>
              </div>
            </WizardSection>
          ) : null}

          {hasValidQuantity ? (
            <WizardSection step="3" title="Choose service" ready={hasSelectedRequestType}>
              <div className="grid gap-2 sm:grid-cols-2">
                {requestTypes.map((requestType) => {
                  const service = findServiceForRequestType(services, requestType);

                  return (
                    <button
                      key={requestType}
                      type="button"
                      className={`rounded-lg border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                        form.request_type === requestType
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-white"
                      }`}
                      onClick={() => selectRequestType(requestType)}
                    >
                      <p className="font-semibold text-slate-950">{requestType}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {service
                          ? `${formatMoney(getServicePrice(service, overrides, selectedClientId))} · ${formatPricingType(service.pricing_type)}`
                          : "Estimate can be updated by admin"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </WizardSection>
          ) : null}

          {hasSelectedRequestType ? (
            <WizardSection step="4" title="Request details" ready>
              <ServiceDetailsFields
                form={form}
                setForm={setForm}
                shippingLabelFiles={shippingLabelFiles}
                boxLabelFiles={boxLabelFiles}
                supportFiles={supportFiles}
                setShippingLabelFiles={setShippingLabelFiles}
                setBoxLabelFiles={setBoxLabelFiles}
                setSupportFiles={setSupportFiles}
              />

              <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-blue-700"
                  onClick={() => setMoreOptionsOpen((open) => !open)}
                >
                  {moreOptionsOpen ? "Hide more options" : "More options"}
                </button>
                {moreOptionsOpen ? (
                  <div className="space-y-3">
                    <Field label="Notes">
                      <textarea
                        className={textAreaClassName}
                        value={form.notes}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      />
                    </Field>
                    <Field label="Additional services">
                      <div className="grid gap-2 rounded-md border border-slate-200 p-3">
                        {services.map((service) => (
                          <label key={service.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={form.service_ids.includes(service.id)}
                                disabled={selectedService?.id === service.id}
                                onChange={(event) =>
                                  toggleAddOnService(service.id, event.target.checked)
                                }
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
                    {isAdmin ? (
                      <Field label="Estimated/final price override">
                        <input
                          className={inputClassName}
                          min="0"
                          step="0.01"
                          type="number"
                          value={form.estimated_total_override}
                          onChange={(event) =>
                            setForm({ ...form, estimated_total_override: event.target.value })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </WizardSection>
          ) : null}

          {hasSelectedProduct && hasValidQuantity && hasSelectedRequestType ? (
            <WizardSection step="5" title="Review & submit" ready>
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="grid gap-3 text-sm text-blue-950 sm:grid-cols-2">
                  <SummaryItem label="Product" value={selectedInventory?.products?.product_name ?? "-"} />
                  <SummaryItem label="Quantity" value={`${requestedQuantity} units`} />
                  <SummaryItem label="Service" value={form.request_type} />
                  <SummaryItem
                    label="Files"
                    value={`${shippingLabelFiles.length + boxLabelFiles.length + supportFiles.length} selected`}
                  />
                  <SummaryItem
                    label="Add-ons"
                    value={selectedServices.length ? selectedServices.map((service) => service.name).join(", ") : "None"}
                  />
                </div>
                <div className="border-t border-blue-200 pt-3">
                  <p className="text-sm font-semibold text-blue-900">Estimated total</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-950">
                    {formatMoney(estimatedTotal)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : isEditMode ? "Save request" : "Submit request"}
                </Button>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  href="/requests"
                >
                  Cancel
                </Link>
              </div>
            </WizardSection>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}

function WizardSection({
  step,
  title,
  ready,
  children,
}: {
  step: string;
  title: string;
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            {step}
          </span>
          <p className="font-semibold text-slate-950">{title}</p>
        </div>
        {ready ? <StatusBadge tone="emerald">Ready</StatusBadge> : null}
      </div>
      {children}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs font-semibold uppercase text-blue-700">{label}</span>
      {value}
    </p>
  );
}

function ServiceDetailsFields({
  form,
  setForm,
  shippingLabelFiles,
  boxLabelFiles,
  supportFiles,
  setShippingLabelFiles,
  setBoxLabelFiles,
  setSupportFiles,
}: {
  form: RequestForm;
  setForm: Dispatch<SetStateAction<RequestForm>>;
  shippingLabelFiles: File[];
  boxLabelFiles: File[];
  supportFiles: File[];
  setShippingLabelFiles: Dispatch<SetStateAction<File[]>>;
  setBoxLabelFiles: Dispatch<SetStateAction<File[]>>;
  setSupportFiles: Dispatch<SetStateAction<File[]>>;
}) {
  if (form.request_type === "FBA Prep") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="FNSKU">
          <input className={inputClassName} required value={form.fnsku} onChange={(event) => setForm({ ...form, fnsku: event.target.value })} />
        </Field>
        <Field label="ASIN optional">
          <input className={inputClassName} value={form.asin} onChange={(event) => setForm({ ...form, asin: event.target.value })} />
        </Field>
        <Field label="Amazon Shipment ID optional">
          <input className={inputClassName} value={form.amazon_shipment_id} onChange={(event) => setForm({ ...form, amazon_shipment_id: event.target.value })} />
        </Field>
        <Field label="Box count">
          <input className={inputClassName} min="0" type="number" value={form.box_count} onChange={(event) => setForm({ ...form, box_count: event.target.value })} />
        </Field>
        <Field label="Carrier">
          <input className={inputClassName} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
        </Field>
        <Field label="Tracking numbers">
          <textarea className={textAreaClassName} placeholder="One per line or comma separated" value={form.tracking_numbers} onChange={(event) => setForm({ ...form, tracking_numbers: event.target.value })} />
        </Field>
        <FileField label="Shipping labels upload" files={shippingLabelFiles} onChange={setShippingLabelFiles} />
        <FileField label="Box labels upload" files={boxLabelFiles} onChange={setBoxLabelFiles} />
      </div>
    );
  }

  if (form.request_type === "FBM Fulfillment") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Marketplace/store optional">
          <input className={inputClassName} value={form.marketplace} onChange={(event) => setForm({ ...form, marketplace: event.target.value })} />
        </Field>
        <Field label="Order number optional">
          <input className={inputClassName} value={form.order_number} onChange={(event) => setForm({ ...form, order_number: event.target.value })} />
        </Field>
        <Field label="Ship-to/customer address">
          <textarea className={textAreaClassName} required value={form.ship_to_address} onChange={(event) => setForm({ ...form, ship_to_address: event.target.value })} />
        </Field>
        <Field label="Shipping method">
          <input className={inputClassName} required value={form.shipping_method} onChange={(event) => setForm({ ...form, shipping_method: event.target.value })} />
        </Field>
        <Field label="Packaging instructions">
          <textarea className={textAreaClassName} value={form.packaging_instructions} onChange={(event) => setForm({ ...form, packaging_instructions: event.target.value })} />
        </Field>
        <Field label="Tracking number optional">
          <input className={inputClassName} value={form.tracking_numbers} onChange={(event) => setForm({ ...form, tracking_numbers: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (form.request_type === "Storage") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Storage notes">
          <textarea className={textAreaClassName} required value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <Field label="Expected duration optional">
          <input className={inputClassName} value={form.storage_duration} onChange={(event) => setForm({ ...form, storage_duration: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (form.request_type === "Forwarding") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Destination address">
          <textarea className={textAreaClassName} required value={form.destination_address} onChange={(event) => setForm({ ...form, destination_address: event.target.value })} />
        </Field>
        <Field label="Carrier">
          <input className={inputClassName} required value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
        </Field>
        <Field label="Shipping method">
          <input className={inputClassName} required value={form.shipping_method} onChange={(event) => setForm({ ...form, shipping_method: event.target.value })} />
        </Field>
        <Field label="Notes">
          <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (form.request_type === "Inspection") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Inspection instructions">
          <textarea className={textAreaClassName} required value={form.inspection_instructions} onChange={(event) => setForm({ ...form, inspection_instructions: event.target.value })} />
        </Field>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.photo_report} onChange={(event) => setForm({ ...form, photo_report: event.target.checked })} />
          Photo report
        </label>
        <Field label="Notes">
          <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (form.request_type === "Bundle Creation") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bundle instructions">
          <textarea className={textAreaClassName} required value={form.bundle_instructions} onChange={(event) => setForm({ ...form, bundle_instructions: event.target.value })} />
        </Field>
        <Field label="Components/products">
          <textarea className={textAreaClassName} required value={form.bundle_components} onChange={(event) => setForm({ ...form, bundle_components: event.target.value })} />
        </Field>
        <Field label="Quantity to bundle">
          <input className={inputClassName} min="1" required type="number" value={form.bundle_quantity} onChange={(event) => setForm({ ...form, bundle_quantity: event.target.value })} />
        </Field>
        <Field label="Labeling requirements optional">
          <input className={inputClassName} value={form.labeling_requirements} onChange={(event) => setForm({ ...form, labeling_requirements: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (form.request_type === "Returns") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Return reason">
          <textarea className={textAreaClassName} required value={form.return_reason} onChange={(event) => setForm({ ...form, return_reason: event.target.value })} />
        </Field>
        <Field label="Condition notes">
          <textarea className={textAreaClassName} value={form.condition_notes} onChange={(event) => setForm({ ...form, condition_notes: event.target.value })} />
        </Field>
        <FileField label="Photos/files optional" files={supportFiles} onChange={setSupportFiles} />
        <Field label="Next action requested">
          <input className={inputClassName} required value={form.next_action} onChange={(event) => setForm({ ...form, next_action: event.target.value })} />
        </Field>
      </div>
    );
  }

  return null;
}

function FileField({
  label,
  files,
  onChange,
}: {
  label: string;
  files: File[];
  onChange: Dispatch<SetStateAction<File[]>>;
}) {
  return (
    <Field label={label}>
      <input
        className={inputClassName}
        multiple
        type="file"
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
      />
      {files.length > 0 ? (
        <p className="mt-1 text-xs font-medium text-slate-500">
          {files.length} file{files.length === 1 ? "" : "s"} selected
        </p>
      ) : null}
    </Field>
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

function findServiceForRequestType(services: Service[], requestType: RequestType | "") {
  if (!requestType) return null;

  const normalizedType = requestType.toLowerCase();
  const primaryWord = normalizedType.split(" ")[0];

  return (
    services.find((service) => service.name.toLowerCase() === normalizedType) ??
    services.find((service) => service.name.toLowerCase().includes(normalizedType)) ??
    services.find(
      (service) =>
        service.name.toLowerCase().includes(primaryWord) ||
        service.category.toLowerCase().includes(primaryWord),
    ) ??
    null
  );
}

function normalizeRequestForm(form: RequestForm, selectedService: Service | null) {
  return {
    ...form,
    service_ids: selectedService
      ? Array.from(new Set([selectedService.id, ...form.service_ids]))
      : form.service_ids,
  };
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
  services: Service[],
  overrides: Override[],
  clientId: string | null | undefined,
) {
  const boxCount = Number(form.box_count) || 1;
  const quantity = Number(form.requested_quantity) || 0;

  return form.service_ids.reduce((total, serviceId) => {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return total;

    const price = getServicePrice(service, overrides, clientId);
    const basis = serviceQuantityBasis(service.pricing_type, quantity, boxCount);
    return total + price * basis;
  }, 0);
}

function buildRequestItemServices(
  form: RequestForm,
  requestItemId: string,
  services: Service[],
  overrides: Override[],
  clientId: string,
) {
  const requestedQuantity = Number(form.requested_quantity) || 0;
  const boxCount = Number(form.box_count) || 1;

  return form.service_ids
    .map((serviceId) => {
      const service = services.find((item) => item.id === serviceId);
      if (!service) return null;

      const unitPrice = getServicePrice(service, overrides, clientId);
      const quantityBasis = serviceQuantityBasis(service.pricing_type, requestedQuantity, boxCount);

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
  inventoryRow: InventoryRow | null,
  existingRequest: ServiceRequest | null,
  clientId: string,
) {
  if (!form.request_type) return "Choose a service type.";
  if (!inventoryRow || inventoryRow.client_id !== clientId) {
    return "Choose an inventory product for this client.";
  }

  const quantity = Number(form.requested_quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "Requested quantity must be a whole number greater than 0.";
  }

  if (quantity > availableForSelectedInventory(inventoryRow, existingRequest)) {
    return `Requested quantity for ${inventoryRow.products?.product_name ?? "this product"} exceeds available inventory.`;
  }

  return null;
}

function availableForSelectedInventory(row: InventoryRow | null, existingRequest: ServiceRequest | null) {
  if (!row) return 0;

  const existingItem = existingRequest?.request_items.find((item) => item.inventory_id === row.id);
  const reservedQuantity =
    existingRequest && existingRequest.status !== "Draft" ? existingItem?.requested_quantity ?? 0 : 0;

  return row.available_qty + reservedQuantity;
}

function buildRequestNotes(form: RequestForm) {
  const details = [
    `Request type: ${form.request_type || "Not selected"}`,
    form.notes.trim() ? `Notes: ${form.notes.trim()}` : null,
    form.fnsku.trim() ? `FNSKU: ${form.fnsku.trim()}` : null,
    form.asin.trim() ? `ASIN: ${form.asin.trim()}` : null,
    form.amazon_shipment_id.trim() ? `Amazon Shipment ID: ${form.amazon_shipment_id.trim()}` : null,
    form.marketplace.trim() ? `Marketplace/store: ${form.marketplace.trim()}` : null,
    form.order_number.trim() ? `Order number: ${form.order_number.trim()}` : null,
    form.ship_to_address.trim() ? `Ship-to address: ${form.ship_to_address.trim()}` : null,
    form.shipping_method.trim() ? `Shipping method: ${form.shipping_method.trim()}` : null,
    form.packaging_instructions.trim() ? `Packaging instructions: ${form.packaging_instructions.trim()}` : null,
    form.storage_duration.trim() ? `Expected duration: ${form.storage_duration.trim()}` : null,
    form.destination_address.trim() ? `Destination address: ${form.destination_address.trim()}` : null,
    form.inspection_instructions.trim() ? `Inspection instructions: ${form.inspection_instructions.trim()}` : null,
    form.photo_report ? "Photo report requested: yes" : null,
    form.bundle_instructions.trim() ? `Bundle instructions: ${form.bundle_instructions.trim()}` : null,
    form.bundle_components.trim() ? `Bundle components: ${form.bundle_components.trim()}` : null,
    form.bundle_quantity.trim() ? `Bundle quantity: ${form.bundle_quantity.trim()}` : null,
    form.labeling_requirements.trim() ? `Labeling requirements: ${form.labeling_requirements.trim()}` : null,
    form.return_reason.trim() ? `Return reason: ${form.return_reason.trim()}` : null,
    form.condition_notes.trim() ? `Condition notes: ${form.condition_notes.trim()}` : null,
    form.next_action.trim() ? `Next action requested: ${form.next_action.trim()}` : null,
  ].filter(Boolean);

  return details.join("\n");
}

function extractNoteValue(notes: string | null, label: string) {
  return (
    notes
      ?.split("\n")
      .find((line) => line.startsWith(`${label}:`))
      ?.replace(`${label}:`, "")
      .trim() ?? ""
  );
}

function formFromRequest(request: ServiceRequest) {
  const item = request.request_items[0];
  const requestType = coerceRequestType(extractNoteValue(request.notes, "Request type"));

  return {
    ...emptyForm(),
    client_id: request.client_id,
    inventory_id: item?.inventory_id ?? "",
    requested_quantity: String(item?.requested_quantity ?? 1),
    request_type: requestType,
    service_ids: item?.request_item_services.map((service) => service.service_id) ?? [],
    carrier: request.carrier ?? "",
    tracking_numbers: request.tracking_numbers.join("\n"),
    box_count: String(request.box_count ?? 0),
    shipping_label_urls: request.shipping_label_urls.join("\n"),
    notes: extractNoteValue(request.notes, "Notes"),
    fnsku: item?.fnsku ?? extractNoteValue(request.notes, "FNSKU"),
    asin: extractNoteValue(request.notes, "ASIN"),
    amazon_shipment_id: extractNoteValue(request.notes, "Amazon Shipment ID"),
    marketplace: extractNoteValue(request.notes, "Marketplace/store"),
    order_number: extractNoteValue(request.notes, "Order number"),
    ship_to_address: extractNoteValue(request.notes, "Ship-to address"),
    shipping_method: extractNoteValue(request.notes, "Shipping method"),
    packaging_instructions: extractNoteValue(request.notes, "Packaging instructions"),
    storage_duration: extractNoteValue(request.notes, "Expected duration"),
    destination_address: extractNoteValue(request.notes, "Destination address"),
    inspection_instructions: extractNoteValue(request.notes, "Inspection instructions"),
    photo_report: request.notes?.includes("Photo report requested: yes") ?? false,
    bundle_instructions: extractNoteValue(request.notes, "Bundle instructions"),
    bundle_components: extractNoteValue(request.notes, "Bundle components"),
    bundle_quantity: extractNoteValue(request.notes, "Bundle quantity"),
    labeling_requirements: extractNoteValue(request.notes, "Labeling requirements"),
    return_reason: extractNoteValue(request.notes, "Return reason"),
    condition_notes: extractNoteValue(request.notes, "Condition notes"),
    next_action: extractNoteValue(request.notes, "Next action requested"),
    estimated_total_override: String(request.estimated_total || ""),
  };
}

function coerceRequestType(value: string): RequestType | "" {
  return requestTypes.includes(value as RequestType) ? (value as RequestType) : "";
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}
