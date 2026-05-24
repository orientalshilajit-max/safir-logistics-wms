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
  QuickFilterButton,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";
import { formatMoney, formatPricingType } from "../services/service-form-client";
import { ActivityTimeline } from "@/app/components/activity-timeline";
import {
  hasMissingBoxLabels,
  LabelManager,
  type RequestBoxOption,
} from "@/app/components/label-manager";

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
  request_boxes: RequestBoxOption[];
  shipping_labels: Pick<
    Tables<"shipping_labels">,
    "id" | "label_category" | "request_box_id" | "box_number"
  >[];
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
  box_barcode: string;
  box_barcode_type: string;
  items: Record<string, string>;
};

type RequestForm = {
  client_id: string;
  carrier: string;
  tracking_numbers: string;
  box_count: string;
  shipping_label_urls: string;
  notes: string;
  request_type: RequestType | "";
  marketplace: string;
  order_number: string;
  ship_to_address: string;
  shipping_method: string;
  packaging_instructions: string;
  fnsku: string;
  asin: string;
  amazon_shipment_id: string;
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
  lines: RequestLine[];
  boxes: RequestBox[];
};

type RequestType =
  | "FBA Prep"
  | "FBM Fulfillment"
  | "Storage"
  | "Forwarding"
  | "Inspection"
  | "Bundle Creation"
  | "Returns";

const requestStatuses: ServiceRequest["status"][] = [
  "Draft",
  "Submitted",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Waiting Labels",
  "Labels Uploaded",
  "Ready to Pack",
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
  request_type: "",
  marketplace: "",
  order_number: "",
  ship_to_address: "",
  shipping_method: "",
  packaging_instructions: "",
  fnsku: "",
  asin: "",
  amazon_shipment_id: "",
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
  lines: [newLine()],
  boxes: [],
});

const requestTypes: RequestType[] = [
  "FBA Prep",
  "FBM Fulfillment",
  "Storage",
  "Forwarding",
  "Inspection",
  "Bundle Creation",
  "Returns",
];

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
  const [productSearch, setProductSearch] = useState("");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [shippingLabelFiles, setShippingLabelFiles] = useState<File[]>([]);
  const [boxLabelFiles, setBoxLabelFiles] = useState<File[]>([]);
  const [supportFiles, setSupportFiles] = useState<File[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isClientPortal = role === "client";
  const selectedClientId = isAdmin ? form.client_id : clientId;
  const selectedLine = form.lines[0];
  const selectedInventory = inventory.find((row) => row.id === selectedLine?.inventory_id) ?? null;
  const selectedService = useMemo(
    () => findServiceForRequestType(services, form.request_type),
    [form.request_type, services],
  );
  const clientInventory = useMemo(
    () =>
      inventory.filter(
        (row) => row.client_id === selectedClientId && row.available_qty > 0,
      ),
    [inventory, selectedClientId],
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
  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );
  const estimatedTotal = useMemo(
    () => calculateEstimate(form, inventory, services, overrides, selectedClientId),
    [form, inventory, overrides, selectedClientId, services],
  );

  const loadData = useCallback(async () => {
    setError(null);

    const clientsQuery = supabase.from("clients").select("id, company_name").is("deleted_at", null).order("company_name");
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
    const requestsQuery = supabase
      .from("service_requests")
      .select("*, clients(id, company_name), request_items(id), request_boxes(id, box_number, tracking_number), shipping_labels(id, label_category, request_box_id, box_number)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      clientsQuery.eq("id", clientId);
      inventoryQuery.eq("client_id", clientId);
      overridesQuery.eq("client_id", clientId);
      requestsQuery.eq("client_id", clientId);
    }

    const [clientsResult, inventoryResult, servicesResult, overridesResult, requestsResult] =
      await Promise.all([
        clientsQuery,
        inventoryQuery,
        servicesQuery,
        overridesQuery,
        requestsQuery,
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
  }, [clientId, isAdmin, isClientPortal]);

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

  function updateSelectedLine(patch: Partial<RequestLine>) {
    const line = form.lines[0] ?? newLine();
    updateLine(line.localId, patch);
  }

  function selectInventoryRow(row: InventoryRow) {
    const line = form.lines[0] ?? newLine();
    const quantity = Math.min(Number(line.requested_quantity) || 1, row.available_qty);

    setForm((current) => ({
      ...current,
      fnsku: current.fnsku || row.products?.fnsku || "",
      lines: [
        {
          ...line,
          inventory_id: row.id,
          requested_quantity: String(Math.max(quantity, 1)),
        },
      ],
      boxes: [],
    }));
  }

  function selectRequestType(requestType: RequestType) {
    const matchingService = findServiceForRequestType(services, requestType);
    const line = form.lines[0] ?? newLine();

    setForm((current) => ({
      ...current,
      request_type: requestType,
      lines: [
        {
          ...line,
          service_ids: matchingService ? [matchingService.id] : [],
        },
      ],
    }));
  }

  function toggleAddOnService(serviceId: string, checked: boolean) {
    const line = form.lines[0] ?? newLine();
    const requiredServiceIds = selectedService ? [selectedService.id] : [];
    const nextServices = checked
      ? Array.from(new Set([...line.service_ids, serviceId, ...requiredServiceIds]))
      : line.service_ids.filter((id) => id !== serviceId || requiredServiceIds.includes(id));

    updateLine(line.localId, { service_ids: nextServices });
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
          box_barcode: "",
          box_barcode_type: "",
          items: {},
        },
      ],
    }));
  }

  async function revalidateSelectedInventory(requestForm: RequestForm, client_id: string) {
    const line = requestForm.lines[0];

    if (!line?.inventory_id) {
      return "Choose a product before submitting.";
    }

    const { data, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, client_id, available_qty, product_id, products!inventory_product_id_fkey(product_name)")
      .eq("id", line.inventory_id)
      .is("deleted_at", null)
      .single();

    if (inventoryError || !data) {
      return inventoryError?.message ?? "Selected inventory is no longer available.";
    }

    if (data.client_id !== client_id) {
      return "Selected inventory does not belong to this client.";
    }

    const requestedQuantity = Number(line.requested_quantity) || 0;

    if (requestedQuantity > data.available_qty) {
      const productName = data.products?.product_name ?? "this product";
      return `Only ${data.available_qty} units are available for ${productName}.`;
    }

    return null;
  }

  async function uploadRequestFiles(requestId: string, client_id: string) {
    const uploadGroups: { files: File[]; labelCategory: "shipping_label" | "fba_box_label" | "misc_document" }[] = [
      { files: shippingLabelFiles, labelCategory: "shipping_label" },
      { files: boxLabelFiles, labelCategory: "fba_box_label" },
      { files: supportFiles, labelCategory: "misc_document" },
    ];

    for (const group of uploadGroups) {
      for (const file of group.files) {
        const storagePath = [
          client_id,
          requestId,
          `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`,
        ].join("/");

        const { error: uploadError } = await supabase.storage
          .from("shipping-labels")
          .upload(storagePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          return uploadError.message;
        }

        const { data: signedUrl } = await supabase.storage
          .from("shipping-labels")
          .createSignedUrl(storagePath, 60 * 60);

        const { error: labelError } = await supabase.from("shipping_labels").insert({
          client_id,
          service_request_id: requestId,
          entity_type: "service_requests",
          entity_id: requestId,
          label_category: group.labelCategory,
          file_name: file.name,
          file_url: signedUrl?.signedUrl ?? storagePath,
          storage_path: storagePath,
          mime_type: file.type || null,
          uploaded_by: user?.id ?? null,
        });

        if (labelError) {
          return labelError.message;
        }
      }
    }

    return null;
  }

  async function createAndSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    const client_id = selectedClientId;

    if (!client_id) {
      setError("Select a client before submitting a request.");
      setSaving(false);
      return;
    }

    const normalizedForm = normalizeRequestForm(form, selectedService);
    const validationError = validateRequest(normalizedForm, inventory, client_id);

    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    const freshInventoryError = await revalidateSelectedInventory(normalizedForm, client_id);

    if (freshInventoryError) {
      setError(freshInventoryError);
      setSaving(false);
      return;
    }

    const { data: request, error: requestError } = await supabase
      .from("service_requests")
      .insert({
        client_id,
        carrier: normalizedForm.carrier.trim() || null,
        tracking_numbers: splitTextList(normalizedForm.tracking_numbers),
        box_count: Number(normalizedForm.box_count) || normalizedForm.boxes.length,
        shipping_label_urls: splitTextList(normalizedForm.shipping_label_urls),
        notes: buildRequestNotes(normalizedForm),
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

    const uploadError = await uploadRequestFiles(request.id, client_id);

    if (uploadError) {
      setError(uploadError);
      setSaving(false);
      return;
    }

    for (const line of normalizedForm.lines.filter((item) => item.inventory_id)) {
      const inventoryRow = inventory.find((row) => row.id === line.inventory_id);
      if (!inventoryRow) continue;

      const { data: requestItem, error: itemError } = await supabase
        .from("request_items")
        .insert({
          request_id: request.id,
          inventory_id: inventoryRow.id,
          product_id: inventoryRow.product_id,
          fnsku: normalizedForm.fnsku.trim() || inventoryRow.products?.fnsku || null,
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
        Number(normalizedForm.box_count) || normalizedForm.boxes.length,
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

    for (const box of normalizedForm.boxes) {
      const { data: requestBox, error: boxError } = await supabase
        .from("request_boxes")
        .insert({
          request_id: request.id,
          box_number: Number(box.box_number) || 1,
          tracking_number: box.tracking_number.trim() || null,
          uploaded_label_url: box.uploaded_label_url.trim() || null,
          box_barcode: box.box_barcode.trim() || null,
          box_barcode_type: box.box_barcode_type.trim() || null,
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
          const line = normalizedForm.lines.find((item) => item.localId === lineLocalId);
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
      setProductSearch("");
      setMoreOptionsOpen(false);
      setShippingLabelFiles([]);
      setBoxLabelFiles([]);
      setSupportFiles([]);
      await loadData();
    }

    setSaving(false);
  }

  async function updateRequestStatus(
    request: ServiceRequest,
    status: ServiceRequest["status"],
  ) {
    if (updatingStatusId) {
      return;
    }

    if (
      (status === "Rejected" || status === "Completed") &&
      !window.confirm(`Move ${request.request_number} to ${status}?`)
    ) {
      return;
    }

    setError(null);
    setUpdatingStatusId(request.id);
    const previousRequests = requests;
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? { ...item, status } : item)),
    );
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
      setRequests(previousRequests);
      setError(updateError.message);
    } else {
      await loadData();
    }
    setUpdatingStatusId(null);
  }

  function applyLocalStatus(status: ServiceRequest["status"]) {
    if (!selectedRequestId) return;

    setRequests((current) =>
      current.map((request) =>
        request.id === selectedRequestId ? { ...request, status } : request,
      ),
    );
  }

  const requestedQuantity = Number(selectedLine?.requested_quantity) || 0;
  const hasSelectedProduct = Boolean(selectedInventory);
  const hasValidQuantity =
    Boolean(selectedInventory) &&
    Number.isInteger(requestedQuantity) &&
    requestedQuantity > 0 &&
    requestedQuantity <= (selectedInventory?.available_qty ?? 0);
  const hasSelectedRequestType = Boolean(form.request_type);
  const selectedAddOns = services.filter((service) =>
    selectedLine?.service_ids.includes(service.id),
  );
  const reviewReady = hasSelectedProduct && hasValidQuantity && hasSelectedRequestType;

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_34rem]">
        <div className="2xl:col-span-2">
          <StatusBadge tone="blue">{requests.length} requests</StatusBadge>
        </div>
        <Panel
          title={isClientPortal ? "My request list" : "Requests"}
          description="Submitted requests require admin approval before work starts."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "Pending Approval", "Waiting Labels", "Labels Uploaded", "Ready to Pack", "Completed"] as const).map(
              (status) => (
                <QuickFilterButton
                  key={status}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? "All" : status}
                </QuickFilterButton>
              ),
            )}
          </div>
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
            <LoadingState label="Loading service requests..." />
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              title={isClientPortal ? "No requests yet" : "No service requests found"}
              body={
                isClientPortal
                  ? "Create a request when you have available inventory ready for prep work."
                  : "Create a request from available inventory to begin."
              }
            />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
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
                  {filteredRequests.map((request) => {
                    const missingLabels = hasMissingBoxLabels(
                      request.request_boxes,
                      request.shipping_labels,
                    );

                    return (
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
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge tone={statusTone(request.status)}>{request.status}</StatusBadge>
                            {missingLabels ? <StatusBadge tone="amber">Missing labels</StatusBadge> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={!isAdmin || updatingStatusId === request.id}
                              onClick={() => void updateRequestStatus(request, "Approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              disabled={!isAdmin || updatingStatusId === request.id}
                              onClick={() => void updateRequestStatus(request, "Rejected")}
                            >
                              Reject
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={!isAdmin || updatingStatusId === request.id}
                              onClick={() => void updateRequestStatus(request, "Need Client Action")}
                            >
                              Request changes
                            </Button>
                            <Button
                              type="button"
                              disabled={!isAdmin || updatingStatusId === request.id}
                              onClick={() => void updateRequestStatus(request, "Completed")}
                            >
                              Complete
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

        <div className="space-y-5">
          <Panel
            title={isClientPortal ? "Create my request" : "Create request"}
            description="A simple guided request from available inventory."
          >
            <form className="space-y-5" onSubmit={(event) => void createAndSubmitRequest(event)}>
              {isAdmin ? (
                <Field label="Client">
                  <select
                    className={inputClassName}
                    required
                    value={form.client_id}
                    onChange={(event) => {
                      setForm({
                        ...emptyForm(),
                        client_id: event.target.value,
                      });
                      setProductSearch("");
                      setMoreOptionsOpen(false);
                      setShippingLabelFiles([]);
                      setBoxLabelFiles([]);
                      setSupportFiles([]);
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

              <WizardSection
                step="1"
                title="Choose product"
                ready={hasSelectedProduct}
              >
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
                              selectedLine?.inventory_id === row.id
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
                              <StatusBadge tone="emerald">{row.available_qty} available</StatusBadge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </WizardSection>

              {hasSelectedProduct ? (
                <WizardSection
                  step="2"
                  title="Choose quantity"
                  ready={hasValidQuantity}
                >
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-950">
                        {selectedInventory?.products?.product_name ?? "Selected product"}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {selectedInventory?.available_qty ?? 0} units available
                      </p>
                    </div>
                    <Field label="Requested quantity">
                      <input
                        className={inputClassName}
                        min="1"
                        max={selectedInventory?.available_qty}
                        required
                        type="number"
                        value={selectedLine?.requested_quantity ?? ""}
                        onChange={(event) =>
                          updateSelectedLine({ requested_quantity: event.target.value })
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        updateSelectedLine({
                          requested_quantity: String(selectedInventory?.available_qty ?? 0),
                        })
                      }
                    >
                      All units
                    </Button>
                    {!hasValidQuantity ? (
                      <p className="text-sm font-medium text-amber-700">
                        Enter a whole number no higher than available inventory.
                      </p>
                    ) : null}
                  </div>
                </WizardSection>
              ) : null}

              {hasValidQuantity ? (
                <WizardSection
                  step="3"
                  title="Choose service"
                  ready={hasSelectedRequestType}
                >
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
                              : "Catalog price not configured"}
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
                    addBox={addBox}
                    updateBox={updateBox}
                    shippingLabelFiles={shippingLabelFiles}
                    boxLabelFiles={boxLabelFiles}
                    supportFiles={supportFiles}
                    setShippingLabelFiles={setShippingLabelFiles}
                    setBoxLabelFiles={setBoxLabelFiles}
                    setSupportFiles={setSupportFiles}
                  />

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-blue-700"
                      onClick={() => setMoreOptionsOpen((open) => !open)}
                    >
                      {moreOptionsOpen ? "Hide more options" : "More options"}
                    </button>
                    {moreOptionsOpen ? (
                      <div className="space-y-3">
                        <Field label="Request notes">
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
                                    checked={selectedLine?.service_ids.includes(service.id) ?? false}
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
                      </div>
                    ) : null}
                  </div>
                </WizardSection>
              ) : null}

              {reviewReady ? (
                <WizardSection step="5" title="Review & submit" ready>
                  <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="grid gap-3 text-sm text-blue-950 sm:grid-cols-2">
                      <p>
                        <span className="block text-xs font-semibold uppercase text-blue-700">Product</span>
                        {selectedInventory?.products?.product_name ?? "Selected product"}
                      </p>
                      <p>
                        <span className="block text-xs font-semibold uppercase text-blue-700">Quantity</span>
                        {requestedQuantity} units
                      </p>
                      <p>
                        <span className="block text-xs font-semibold uppercase text-blue-700">Service</span>
                        {form.request_type}
                      </p>
                      <p>
                        <span className="block text-xs font-semibold uppercase text-blue-700">Files</span>
                        {shippingLabelFiles.length + boxLabelFiles.length + supportFiles.length} uploaded
                      </p>
                      <p className="sm:col-span-2">
                        <span className="block text-xs font-semibold uppercase text-blue-700">Add-ons</span>
                        {selectedAddOns.length > 0
                          ? selectedAddOns.map((service) => service.name).join(", ")
                          : "None"}
                      </p>
                    </div>
                    <div className="border-t border-blue-200 pt-3">
                      <p className="text-sm font-semibold text-blue-900">Estimated total</p>
                      <p className="mt-1 text-2xl font-semibold text-blue-950">
                        {formatMoney(estimatedTotal)}
                      </p>
                    </div>
                  </div>

                  <Button type="submit" disabled={saving || !selectedClientId || !reviewReady}>
                    {saving ? "Submitting..." : "Submit request"}
                  </Button>
                </WizardSection>
              ) : null}
            </form>
          </Panel>
          <ActivityTimeline
            entityType="service_requests"
            entityId={selectedRequestId}
            title="Request activity"
          />
          <LabelManager
            clientId={selectedRequest?.client_id ?? selectedClientId}
            serviceRequestId={selectedRequestId}
            boxes={selectedRequest?.request_boxes ?? []}
            title="Request labels"
            onLabelsChange={loadData}
            onStatusChange={applyLocalStatus}
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

function ServiceDetailsFields({
  form,
  setForm,
  addBox,
  updateBox,
  shippingLabelFiles,
  boxLabelFiles,
  supportFiles,
  setShippingLabelFiles,
  setBoxLabelFiles,
  setSupportFiles,
}: {
  form: RequestForm;
  setForm: Dispatch<SetStateAction<RequestForm>>;
  addBox: () => void;
  updateBox: (localId: string, patch: Partial<RequestBox>) => void;
  shippingLabelFiles: File[];
  boxLabelFiles: File[];
  supportFiles: File[];
  setShippingLabelFiles: Dispatch<SetStateAction<File[]>>;
  setBoxLabelFiles: Dispatch<SetStateAction<File[]>>;
  setSupportFiles: Dispatch<SetStateAction<File[]>>;
}) {
  if (form.request_type === "FBA Prep") {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="FNSKU">
            <input
              className={inputClassName}
              required
              value={form.fnsku}
              onChange={(event) => setForm({ ...form, fnsku: event.target.value })}
            />
          </Field>
          <Field label="ASIN optional">
            <input
              className={inputClassName}
              value={form.asin}
              onChange={(event) => setForm({ ...form, asin: event.target.value })}
            />
          </Field>
          <Field label="Amazon Shipment ID optional">
            <input
              className={inputClassName}
              value={form.amazon_shipment_id}
              onChange={(event) => setForm({ ...form, amazon_shipment_id: event.target.value })}
            />
          </Field>
          <Field label="Box count">
            <input
              className={inputClassName}
              min="0"
              required
              type="number"
              value={form.box_count}
              onChange={(event) => setForm({ ...form, box_count: event.target.value })}
            />
          </Field>
          <Field label="Carrier">
            <input
              className={inputClassName}
              value={form.carrier}
              onChange={(event) => setForm({ ...form, carrier: event.target.value })}
            />
          </Field>
          <Field label="Tracking numbers">
            <textarea
              className={textAreaClassName}
              placeholder="One per line or comma separated"
              value={form.tracking_numbers}
              onChange={(event) => setForm({ ...form, tracking_numbers: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FileField
            label="Shipping labels upload"
            files={shippingLabelFiles}
            onChange={setShippingLabelFiles}
          />
          <FileField
            label="Box labels upload"
            files={boxLabelFiles}
            onChange={setBoxLabelFiles}
          />
        </div>
        <BoxesEditor form={form} addBox={addBox} updateBox={updateBox} />
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
          <input
            type="checkbox"
            checked={form.photo_report}
            onChange={(event) => setForm({ ...form, photo_report: event.target.checked })}
          />
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
        <FileField
          label="Photos/files optional"
          files={supportFiles}
          onChange={setSupportFiles}
        />
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

function BoxesEditor({
  form,
  addBox,
  updateBox,
}: {
  form: RequestForm;
  addBox: () => void;
  updateBox: (localId: string, patch: Partial<RequestBox>) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">Boxes</p>
        <Button type="button" variant="secondary" onClick={addBox}>
          Add box
        </Button>
      </div>
      {form.boxes.length === 0 ? (
        <p className="text-sm text-slate-500">Box details can be added now or later.</p>
      ) : null}
      {form.boxes.map((box) => (
        <div key={box.localId} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
          <Field label="Box number">
            <input className={inputClassName} min="1" type="number" value={box.box_number} onChange={(event) => updateBox(box.localId, { box_number: event.target.value })} />
          </Field>
          <Field label="Tracking number">
            <input className={inputClassName} value={box.tracking_number} onChange={(event) => updateBox(box.localId, { tracking_number: event.target.value })} />
          </Field>
          <Field label="Uploaded label URL">
            <input className={inputClassName} value={box.uploaded_label_url} onChange={(event) => updateBox(box.localId, { uploaded_label_url: event.target.value })} />
          </Field>
          <Field label="Box barcode">
            <input className={inputClassName} value={box.box_barcode} onChange={(event) => updateBox(box.localId, { box_barcode: event.target.value })} />
          </Field>
        </div>
      ))}
    </div>
  );
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
  if (!requestType) {
    return null;
  }

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
  const selectedLine = form.lines[0] ?? newLine();

  return {
    ...form,
    lines: [
      {
        ...selectedLine,
        service_ids: selectedService
          ? Array.from(new Set([selectedService.id, ...selectedLine.service_ids]))
          : selectedLine.service_ids,
      },
    ],
  };
}

function buildRequestNotes(form: RequestForm) {
  const details = [
    `Request type: ${form.request_type || "Not selected"}`,
    form.notes.trim() ? `Notes: ${form.notes.trim()}` : null,
    form.fnsku.trim() ? `FNSKU: ${form.fnsku.trim()}` : null,
    form.asin.trim() ? `ASIN: ${form.asin.trim()}` : null,
    form.amazon_shipment_id.trim()
      ? `Amazon Shipment ID: ${form.amazon_shipment_id.trim()}`
      : null,
    form.marketplace.trim() ? `Marketplace/store: ${form.marketplace.trim()}` : null,
    form.order_number.trim() ? `Order number: ${form.order_number.trim()}` : null,
    form.ship_to_address.trim() ? `Ship-to address: ${form.ship_to_address.trim()}` : null,
    form.shipping_method.trim() ? `Shipping method: ${form.shipping_method.trim()}` : null,
    form.packaging_instructions.trim()
      ? `Packaging instructions: ${form.packaging_instructions.trim()}`
      : null,
    form.storage_duration.trim() ? `Expected duration: ${form.storage_duration.trim()}` : null,
    form.destination_address.trim()
      ? `Destination address: ${form.destination_address.trim()}`
      : null,
    form.inspection_instructions.trim()
      ? `Inspection instructions: ${form.inspection_instructions.trim()}`
      : null,
    form.photo_report ? "Photo report requested: yes" : null,
    form.bundle_instructions.trim()
      ? `Bundle instructions: ${form.bundle_instructions.trim()}`
      : null,
    form.bundle_components.trim() ? `Bundle components: ${form.bundle_components.trim()}` : null,
    form.bundle_quantity.trim() ? `Bundle quantity: ${form.bundle_quantity.trim()}` : null,
    form.labeling_requirements.trim()
      ? `Labeling requirements: ${form.labeling_requirements.trim()}`
      : null,
    form.return_reason.trim() ? `Return reason: ${form.return_reason.trim()}` : null,
    form.condition_notes.trim() ? `Condition notes: ${form.condition_notes.trim()}` : null,
    form.next_action.trim() ? `Next action requested: ${form.next_action.trim()}` : null,
  ].filter(Boolean);

  return details.join("\n");
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
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
  if (!form.request_type) {
    return "Choose a service type.";
  }

  const lines = form.lines.filter((line) => line.inventory_id);

  if (lines.length === 0) {
    return "Choose a product.";
  }

  for (const line of lines) {
    const inventoryRow = inventory.find((row) => row.id === line.inventory_id);
    const quantity = Number(line.requested_quantity);

    if (!inventoryRow || inventoryRow.client_id !== clientId) {
      return "Selected inventory does not belong to the request client.";
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return "Requested quantity must be a whole number greater than 0.";
    }

    if (quantity > inventoryRow.available_qty) {
      return `Requested quantity for ${inventoryRow.products?.product_name ?? "a product"} exceeds available inventory.`;
    }

    if (line.service_ids.length === 0 && !form.request_type) {
      return `Select at least one service for ${inventoryRow.products?.product_name ?? "each product"}.`;
    }
  }

  for (const box of form.boxes) {
    const boxNumber = Number(box.box_number);

    if (!Number.isInteger(boxNumber) || boxNumber <= 0) {
      return "Box numbers must be whole numbers greater than 0.";
    }

    for (const [lineId, quantityValue] of Object.entries(box.items)) {
      if (!quantityValue) continue;
      const quantity = Number(quantityValue);

      if (!Number.isInteger(quantity) || quantity < 0) {
        return "Box product quantities must be whole numbers zero or greater.";
      }

      const line = form.lines.find((item) => item.localId === lineId);
      if (line && quantity > Number(line.requested_quantity)) {
        return "A box quantity cannot exceed the requested product quantity.";
      }
    }
  }

  return null;
}

function statusTone(status: ServiceRequest["status"]) {
  if (status === "Approved" || status === "Completed" || status === "Shipped" || status === "Labels Uploaded") {
    return "emerald";
  }

  if (status === "Rejected" || status === "On Hold" || status === "Need Client Action") {
    return "rose";
  }

  if (status === "Pending Approval" || status === "Waiting Labels") {
    return "amber";
  }

  if (status === "Ready to Pack") {
    return "cyan";
  }

  return "blue";
}
