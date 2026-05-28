"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth/auth-provider";
import { CLIENT_ACCOUNT_LINK_ERROR } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabase";
import type { Json, Tables } from "@/app/types/database.types";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "client_id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type CarrierOption = Pick<Tables<"carrier_options">, "id" | "name" | "sort_order">;
type Shipment = Tables<"incoming_shipments"> & {
  incoming_items: Pick<
    Tables<"incoming_items">,
    | "id"
    | "product_id"
    | "expected_quantity"
    | "expected_boxes"
    | "notes"
    | "inventory_posted_at"
  >[];
  incoming_tracking_boxes: Pick<
    Tables<"incoming_tracking_boxes">,
    "id" | "tracking_number" | "box_count" | "inventory_posted_at" | "notes" | "status"
  >[];
  statuses: Pick<Tables<"statuses">, "name"> | null;
};
type ShipmentLine = {
  id?: string;
  product_id: string;
  new_product_name: string;
  expected_quantity: string;
  notes: string;
};
type TrackingLine = {
  id?: string;
  inventory_posted_at?: string | null;
  tracking_number: string;
  box_count: string;
  notes: string;
};
type ShipmentForm = {
  client_id: string;
  carrier: string;
  notes: string;
  status_id: string;
  lines: ShipmentLine[];
  trackingLines: TrackingLine[];
};

const emptyLine: ShipmentLine = {
  product_id: "",
  new_product_name: "",
  expected_quantity: "1",
  notes: "",
};

const emptyTrackingLine: TrackingLine = {
  tracking_number: "",
  box_count: "1",
  notes: "",
};

const emptyForm: ShipmentForm = {
  client_id: "",
  carrier: "",
  notes: "",
  status_id: "",
  lines: [emptyLine],
  trackingLines: [emptyTrackingLine],
};

const incomingShipmentStatusNames = ["In Transit", "Arrived", "Received", "Partially Received", "Need Attention"];
const fullClientEditStatusNames = ["In Transit"];
const limitedClientEditStatusNames = ["Arrived"];
const defaultCarrierNames = [
  "UPS",
  "FedEx",
  "DHL",
  "USPS",
  "OnTrac",
  "Amazon Freight",
  "Amazon Delivery",
  "LTL Freight",
  "Local Delivery",
  "Other",
];
const createNewProductValue = "__create_new_product__";

export function IncomingShipmentFormClient({ shipmentId }: { shipmentId?: string }) {
  const router = useRouter();
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const isAdmin = role === "admin" || role === "warehouse_operator";
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [carrierOptions, setCarrierOptions] = useState<CarrierOption[]>([]);
  const [shipmentStatusName, setShipmentStatusName] = useState("In Transit");
  const [form, setForm] = useState<ShipmentForm>(emptyForm);
  const [creatingProductRows, setCreatingProductRows] = useState<Record<number, boolean>>({});
  const [creatingProductIndex, setCreatingProductIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [removingTrackingId, setRemovingTrackingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableProducts = useMemo(
    () => products.filter((product) => product.client_id === form.client_id),
    [form.client_id, products],
  );
  const canFullyEditShipment = isAdmin || !shipmentId || fullClientEditStatusNames.includes(shipmentStatusName);
  const canEditLimitedClientFields =
    canFullyEditShipment || (isClientPortal && limitedClientEditStatusNames.includes(shipmentStatusName));
  const canEditProductLines = canFullyEditShipment;
  const canEditTrackingLines = canFullyEditShipment || (isClientPortal && limitedClientEditStatusNames.includes(shipmentStatusName));
  const visibleStatuses = useMemo(
    () => statuses.filter((status) => incomingShipmentStatusNames.includes(status.name) || status.id === form.status_id),
    [form.status_id, statuses],
  );
  const visibleCarrierOptions = useMemo(() => {
    const options = carrierOptions.length > 0
      ? carrierOptions
      : defaultCarrierNames.map((name, index) => ({ id: name, name, sort_order: (index + 1) * 10 }));

    if (form.carrier && !options.some((option) => option.name === form.carrier)) {
      return [...options, { id: form.carrier, name: form.carrier, sort_order: options.length * 10 + 10 }];
    }

    return options;
  }, [carrierOptions, form.carrier]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isClientPortal && !clientId) {
      setClients([]);
      setProducts([]);
      setStatuses([]);
      setCarrierOptions([]);
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setLoading(false);
      return;
    }

    const clientsQuery = supabase
      .from("clients")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name");
    const productsQuery = supabase
      .from("products")
      .select("id, client_id, product_name, sku")
      .is("deleted_at", null)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("product_name");
    const statusesQuery = supabase
      .from("statuses")
      .select("id, name, color")
      .eq("category", "incoming_shipment")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order");
    const carriersQuery = supabase
      .from("carrier_options")
      .select("id, name, sort_order")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    const shipmentQuery = shipmentId
      ? (() => {
          let query = supabase
            .from("incoming_shipments")
            .select("*, statuses(name), incoming_items(id, product_id, expected_quantity, expected_boxes, notes, inventory_posted_at), incoming_tracking_boxes(id, tracking_number, box_count, inventory_posted_at, notes, status)")
            .eq("id", shipmentId);

          if (isClientPortal) {
            query = query.eq("client_id", clientId as string);
          }

          return query
            .is("incoming_items.deleted_at", null)
            .is("incoming_tracking_boxes.deleted_at", null)
            .single();
        })()
      : Promise.resolve({ data: null, error: null });

    if (isClientPortal) {
      clientsQuery.eq("id", clientId as string);
      productsQuery.eq("client_id", clientId as string);
    }

    const [clientsResult, productsResult, statusesResult, carriersResult, shipmentResult] = await Promise.all([
      clientsQuery,
      productsQuery,
      statusesQuery,
      carriersQuery,
      shipmentQuery,
    ]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (productsResult.error) setError(productsResult.error.message);
    else setProducts(productsResult.data ?? []);

    const loadedStatuses = statusesResult.data ?? [];
    if (statusesResult.error) setError(statusesResult.error.message);
    else setStatuses(loadedStatuses);

    if (carriersResult.error) setError(carriersResult.error.message);
    else setCarrierOptions(carriersResult.data ?? []);

    if (shipmentResult.error) {
      setError(shipmentResult.error.message);
    } else if (shipmentResult.data) {
      const shipment = shipmentResult.data as Shipment;
      setShipmentStatusName(shipment.statuses?.name ?? "In Transit");
      const trackingLines = shipment.incoming_tracking_boxes.length > 0
        ? shipment.incoming_tracking_boxes.map((box) => ({
          id: box.id,
          inventory_posted_at: box.inventory_posted_at,
          tracking_number: box.tracking_number,
          box_count: box.box_count === null ? "1" : String(box.box_count),
          notes: box.notes ?? "",
        }))
        : shipment.master_tracking_number || shipment.tracking_numbers[0]
          ? [{
              tracking_number: shipment.master_tracking_number ?? shipment.tracking_numbers[0] ?? "",
              box_count: shipment.actual_received_boxes === null ? "1" : String(shipment.actual_received_boxes),
              notes: "",
            }]
          : [emptyTrackingLine];
      setForm({
        client_id: shipment.client_id,
        carrier: shipment.carrier ?? "",
        notes: shipment.notes ?? "",
        status_id: shipment.status_id,
        lines: shipment.incoming_items.length > 0
          ? shipment.incoming_items.map((item) => ({
            id: item.id,
            product_id: item.product_id,
            new_product_name: "",
            expected_quantity: String(item.expected_quantity),
            notes: item.notes ?? "",
          }))
          : [emptyLine],
        trackingLines,
      });
    } else {
      const inTransitStatus = loadedStatuses.find((status) => status.name === "In Transit") ?? loadedStatuses[0];
      setShipmentStatusName("In Transit");
      setForm((current) => ({
        ...current,
        client_id: isClientPortal ? (clientId as string) : current.client_id,
        status_id: current.status_id || inTransitStatus?.id || "",
      }));
    }

    setLoading(false);
  }, [clientId, isClientPortal, shipmentId]);

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

  function updateLine(index: number, line: ShipmentLine) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((currentLine, currentIndex) =>
        currentIndex === index ? line : currentLine,
      ),
    }));
  }

  function addLine() {
    setForm((current) => {
      if (current.lines.some((line) => !line.product_id && !line.new_product_name.trim())) {
        return current;
      }

      return {
        ...current,
        lines: [...current.lines, { ...emptyLine }],
      };
    });
  }

  async function removeLine(index: number) {
    const line = form.lines[index];

    if (!line || removingLineId || !canEditProductLines) return;

    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, currentIndex) => currentIndex !== index),
    }));

    if (!line.id || !shipmentId) {
      return;
    }

    setRemovingLineId(line.id);
    setError(null);

    const { error: removeError } = await supabase
      .from("incoming_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", line.id)
      .eq("shipment_id", shipmentId)
      .is("inventory_posted_at", null);

    if (removeError) {
      setError(removeError.message);
      setForm((current) => ({
        ...current,
        lines: [...current.lines.slice(0, index), line, ...current.lines.slice(index)],
      }));
    }

    setRemovingLineId(null);
  }

  async function createInlineProduct(index: number) {
    const line = form.lines[index];

    if (!line || creatingProductIndex !== null) return;

    if (!form.client_id) {
      setError("Select a client before creating a product.");
      return;
    }

    if (!line.new_product_name.trim()) {
      setError("Enter a product name.");
      return;
    }

    setCreatingProductIndex(index);
    setError(null);

    const { data: lastProduct } = await supabase
      .from("products")
      .select("sort_order")
      .eq("client_id", form.client_id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        active: true,
        client_id: form.client_id,
        product_name: line.new_product_name.trim(),
        sort_order: (lastProduct?.sort_order ?? 0) + 1,
      })
      .select("id, client_id, product_name, sku")
      .single();

    if (productError || !product) {
      setError(productError?.message ?? "Unable to create product.");
      setCreatingProductIndex(null);
      return;
    }

    setProducts((current) => [...current, product].sort((first, second) => first.product_name.localeCompare(second.product_name)));
    setCreatingProductRows((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    updateLine(index, {
      ...line,
      product_id: product.id,
      new_product_name: "",
    });
    setCreatingProductIndex(null);
  }

  function updateTrackingLine(index: number, line: TrackingLine) {
    setForm((current) => ({
      ...current,
      trackingLines: current.trackingLines.map((currentLine, currentIndex) =>
        currentIndex === index ? line : currentLine,
      ),
    }));
  }

  function addTrackingLine() {
    setForm((current) => {
      if (current.trackingLines.some((line) => !line.tracking_number.trim() && !line.notes.trim())) {
        return current;
      }

      return {
        ...current,
        trackingLines: [...current.trackingLines, { ...emptyTrackingLine }],
      };
    });
  }

  async function removeTrackingLine(index: number) {
    const line = form.trackingLines[index];

    if (!line || removingTrackingId || !canEditTrackingLines) return;

    setForm((current) => ({
      ...current,
      trackingLines: current.trackingLines.filter((_, currentIndex) => currentIndex !== index),
    }));

    if (!line.id || !shipmentId) {
      return;
    }

    setRemovingTrackingId(line.id);
    setError(null);

    const { error: removeError } = await supabase
      .from("incoming_tracking_boxes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", line.id)
      .eq("shipment_id", shipmentId)
      .is("inventory_posted_at", null);

    if (removeError) {
      setError(removeError.message);
      setForm((current) => ({
        ...current,
        trackingLines: [...current.trackingLines.slice(0, index), line, ...current.trackingLines.slice(index)],
      }));
    }

    setRemovingTrackingId(null);
  }

  async function saveShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    if (!form.client_id || !form.status_id) {
      setError(isClientPortal ? "Unable to identify your client account." : "Client and status are required.");
      setSaving(false);
      return;
    }

    if (isClientPortal && (!clientId || form.client_id !== clientId)) {
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setSaving(false);
      return;
    }

    if (!isAdmin && shipmentId && !canEditLimitedClientFields) {
      setError("This shipment already has warehouse activity and cannot be edited.");
      setSaving(false);
      return;
    }

    const preparedLines = normalizeShipmentLines(form.lines);

    if (preparedLines.length === 0) {
      setError("Add at least one product line.");
      setSaving(false);
      return;
    }

    for (const line of preparedLines) {
      const expectedQuantity = Number(line.expected_quantity);

      if (!Number.isInteger(expectedQuantity) || expectedQuantity < 1) {
        setError("Unit quantities must be whole numbers greater than zero.");
        setSaving(false);
        return;
      }

      if (!line.product_id) {
        setError("Create or select each product before saving the shipment.");
        setSaving(false);
        return;
      }

      const selectedProduct = products.find((product) => product.id === line.product_id);

      if (!selectedProduct || selectedProduct.client_id !== form.client_id) {
        setError("Selected products must belong to the shipment client.");
        setSaving(false);
        return;
      }
    }

    const duplicateProduct = findDuplicateProduct(preparedLines);

    if (duplicateProduct) {
      setError("Each product can only appear once on an incoming shipment.");
      setSaving(false);
      return;
    }

    const validTrackingRows = normalizeTrackingLines(form.trackingLines);

    for (const line of validTrackingRows) {
      if (!line.tracking_number.trim() && !line.box_count.trim() && !line.notes.trim()) continue;
      const boxCount = line.box_count.trim() === "" ? null : Number(line.box_count);

      if (boxCount !== null && (!Number.isInteger(boxCount) || boxCount < 1)) {
        setError("Tracking box counts must be whole numbers greater than zero.");
        setSaving(false);
        return;
      }
    }

    const duplicateTracking = findDuplicateTracking(validTrackingRows);

    if (duplicateTracking) {
      setError("Each tracking number can only appear once on an incoming shipment.");
      setSaving(false);
      return;
    }

    const trackingNumbers = validTrackingRows
      .map((line) => line.tracking_number.trim())
      .filter(Boolean);
    const totalBoxes = validTrackingRows.reduce((sum, line) => sum + (line.box_count.trim() === "" ? 1 : Number(line.box_count)), 0);
    const masterTracking = trackingNumbers[0] ?? "";

    if (isClientPortal && shipmentId && !canFullyEditShipment && canEditLimitedClientFields) {
      const timestamp = new Date().toISOString();
      const { error: limitedUpdateError } = await supabase.rpc("update_incoming_shipment_client_limited", {
        p_carrier: form.carrier.trim(),
        p_item_notes: preparedLines
          .filter((line) => line.id)
          .map((line) => ({ id: line.id as string, notes: line.notes.trim() })) as Json,
        p_shipment_id: shipmentId,
        p_tracking_rows: validTrackingRows.map((line) => ({
          box_count: line.box_count.trim() || "1",
          id: line.id ?? null,
          notes: line.notes.trim(),
          tracking_number: line.tracking_number.trim(),
        })) as Json,
      });

      if (limitedUpdateError) {
        setError(limitedUpdateError.message);
        setSaving(false);
        return;
      }

      await supabase.from("activity_logs").insert({
        action: "Client updated incoming shipment",
        client_id: form.client_id,
        entity_id: shipmentId,
        entity_type: "incoming_shipments",
        metadata: { updated_at: timestamp },
        user_type: "client",
      });
      await supabase.from("notifications").insert({
        client_id: form.client_id,
        entity_id: shipmentId,
        entity_type: "incoming_shipments",
        metadata: { updated_at: timestamp },
        notification_type: "incoming_shipment_updated",
        title: "Client updated incoming shipment",
      });

      router.push("/incoming-shipments");
      router.refresh();
      return;
    }

    const shipmentPayload = {
      client_id: form.client_id,
      supplier: null,
      carrier: form.carrier.trim(),
      master_tracking_number: masterTracking || null,
      tracking_numbers: Array.from(new Set(trackingNumbers)),
      number_of_boxes: totalBoxes,
      expected_arrival_date: null,
      notes: form.notes.trim() || null,
      status_id: isAdmin || shipmentId ? form.status_id : statuses.find((status) => status.name === "In Transit")?.id ?? form.status_id,
      updated_at: new Date().toISOString(),
    };

    const shipmentResult = shipmentId
      ? await supabase.from("incoming_shipments").update(shipmentPayload).eq("id", shipmentId).eq("client_id", form.client_id).select("id").single()
      : await supabase.from("incoming_shipments").insert(shipmentPayload).select("id").single();

    if (shipmentResult.error || !shipmentResult.data) {
      setError(shipmentResult.error?.message ?? "Unable to save shipment.");
      setSaving(false);
      return;
    }

    const activeShipmentId = shipmentResult.data.id;

    if (canFullyEditShipment) {
      const retainedItemIds = preparedLines.map((line) => line.id).filter(Boolean) as string[];
      let softDeleteQuery = supabase
        .from("incoming_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("shipment_id", activeShipmentId)
        .is("inventory_posted_at", null);

      if (retainedItemIds.length > 0) {
        softDeleteQuery = softDeleteQuery.not("id", "in", `(${retainedItemIds.join(",")})`);
      }

      const { error: softDeleteError } = await softDeleteQuery;

      if (softDeleteError) {
        setError(softDeleteError.message);
        setSaving(false);
        return;
      }

      for (const line of preparedLines) {
        const payload = {
          expected_boxes: 0,
          expected_quantity: Number(line.expected_quantity),
          notes: line.notes.trim() || null,
          product_id: line.product_id,
        };
        const result = line.id
          ? await supabase.from("incoming_items").update(payload).eq("id", line.id).eq("shipment_id", activeShipmentId)
          : await supabase.from("incoming_items").insert({
            ...payload,
            shipment_id: activeShipmentId,
          });

        if (result.error) {
          setError(result.error.message);
          setSaving(false);
          return;
        }
      }
    } else if (canEditLimitedClientFields) {
      for (const line of preparedLines) {
        if (!line.id) continue;

        const { error: noteError } = await supabase
          .from("incoming_items")
          .update({ notes: line.notes.trim() || null })
          .eq("id", line.id)
          .eq("shipment_id", activeShipmentId);

        if (noteError) {
          setError(noteError.message);
          setSaving(false);
          return;
        }
      }
    }

    if (canEditTrackingLines) {
      const retainedBoxIds = validTrackingRows.map((line) => line.id).filter(Boolean) as string[];
      let deleteBoxesQuery = supabase
        .from("incoming_tracking_boxes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("shipment_id", activeShipmentId)
        .is("inventory_posted_at", null);

      if (retainedBoxIds.length > 0) {
        deleteBoxesQuery = deleteBoxesQuery.not("id", "in", `(${retainedBoxIds.join(",")})`);
      }

      const { error: deleteBoxesError } = await deleteBoxesQuery;

      if (deleteBoxesError) {
        setError(deleteBoxesError.message);
        setSaving(false);
        return;
      }

      for (const line of validTrackingRows) {
        const payload = {
          box_count: line.box_count.trim() === "" ? 1 : Number(line.box_count),
          carrier: form.carrier.trim() || null,
          notes: line.notes.trim() || null,
          tracking_number: line.tracking_number.trim(),
        };
        const result = line.id
          ? await supabase.from("incoming_tracking_boxes").update(payload).eq("id", line.id).eq("shipment_id", activeShipmentId)
          : await supabase.from("incoming_tracking_boxes").insert({
            ...payload,
            shipment_id: activeShipmentId,
          });

        if (result.error) {
          setError(result.error.message);
          setSaving(false);
          return;
        }
      }
    }

    if (isClientPortal && shipmentId) {
      const timestamp = new Date().toISOString();
      await supabase.from("activity_logs").insert({
        action: "Client updated incoming shipment",
        client_id: form.client_id,
        entity_id: activeShipmentId,
        entity_type: "incoming_shipments",
        metadata: { updated_at: timestamp },
        user_type: "client",
      });
      await supabase.from("notifications").insert({
        client_id: form.client_id,
        entity_id: activeShipmentId,
        entity_type: "incoming_shipments",
        metadata: { updated_at: timestamp },
        notification_type: "incoming_shipment_updated",
        title: "Client updated incoming shipment",
      });
    }

    router.push("/incoming-shipments");
    router.refresh();
  }

  if (loading) {
    return <LoadingState label="Loading shipment..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/incoming-shipments" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Back to shipments
        </Link>
      </div>
      <ErrorBanner message={error} />
      <Panel title={shipmentId ? "Edit incoming shipment" : "Create incoming shipment"}>
        <form className="space-y-5" onSubmit={(event) => void saveShipment(event)}>
          {isClientPortal ? null : (
            <div className={isAdmin ? "grid gap-4 lg:grid-cols-2" : ""}>
              <Field label="Client">
                <select className={inputClassName} required value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value, lines: [emptyLine] })}>
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </select>
              </Field>
              {isAdmin ? (
                <Field label="Status">
                  <select className={inputClassName} required value={form.status_id} onChange={(event) => setForm({ ...form, status_id: event.target.value })}>
                    <option value="">Select status</option>
                    {visibleStatuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>
          )}

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-950">Products</h3>
            {form.lines.map((line, index) => (
              <div key={line.id ?? `new-${index}`} className="space-y-3 rounded-md border border-slate-100 bg-slate-50 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_7rem_minmax(0,1fr)_auto]">
                  <Field label="Product">
                    <select
                      className={inputClassName}
                      disabled={!canEditProductLines}
                      value={creatingProductRows[index] ? createNewProductValue : line.product_id}
                      onChange={(event) => {
                        const value = event.target.value;

                        if (value === createNewProductValue) {
                          setCreatingProductRows((current) => ({ ...current, [index]: true }));
                          updateLine(index, { ...line, product_id: "", new_product_name: "" });
                          return;
                        }

                        setCreatingProductRows((current) => {
                          const next = { ...current };
                          delete next[index];
                          return next;
                        });
                        updateLine(index, { ...line, product_id: value, new_product_name: "" });
                      }}
                    >
                      <option value="">Select product</option>
                      <option value={createNewProductValue}>+ Create new product</option>
                      {availableProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.product_name}{product.sku ? ` (${product.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Units">
                    <input className={inputClassName} min="1" required disabled={!canEditProductLines} type="number" value={line.expected_quantity} onChange={(event) => updateLine(index, { ...line, expected_quantity: event.target.value })} />
                  </Field>
                  <Field label="Notes">
                    <input className={inputClassName} disabled={!canEditLimitedClientFields} value={line.notes} onChange={(event) => updateLine(index, { ...line, notes: event.target.value })} />
                  </Field>
                  {form.lines.length > 1 && canEditProductLines ? (
                    <div className="flex items-end">
                      <Button type="button" variant="danger" disabled={removingLineId === line.id} onClick={() => void removeLine(index)}>
                        {removingLineId === line.id ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                {creatingProductRows[index] ? (
                  <div className="grid gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      className={inputClassName}
                      placeholder="New product name"
                      value={line.new_product_name}
                      onChange={(event) => updateLine(index, { ...line, new_product_name: event.target.value })}
                    />
                    <Button type="button" disabled={creatingProductIndex === index || !line.new_product_name.trim()} onClick={() => void createInlineProduct(index)}>
                      {creatingProductIndex === index ? "Creating..." : "Create product"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="pt-1">
              <Button type="button" variant="secondary" onClick={addLine} disabled={!form.client_id || !canEditProductLines}>
                + Add Another Product
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-950">Shipping Information</h3>
            <div className="max-w-sm">
              <Field label="Carrier optional">
                <select className={inputClassName} disabled={!canEditTrackingLines} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })}>
                  <option value="">Select carrier</option>
                  {visibleCarrierOptions.map((carrier) => (
                    <option key={carrier.id} value={carrier.name}>
                      {carrier.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.trackingLines.map((line, index) => (
              <div key={line.id ?? `new-${index}`} className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_auto]">
                <Field label="Tracking number">
                  <input className={inputClassName} disabled={!canEditTrackingLines} value={line.tracking_number} onChange={(event) => updateTrackingLine(index, { ...line, tracking_number: event.target.value })} />
                </Field>
                <Field label="Box count">
                  <input className={inputClassName} disabled={!canEditTrackingLines} min="1" type="number" value={line.box_count} onChange={(event) => updateTrackingLine(index, { ...line, box_count: event.target.value })} />
                </Field>
                <Field label="Notes">
                  <input className={inputClassName} disabled={!canEditTrackingLines} value={line.notes} onChange={(event) => updateTrackingLine(index, { ...line, notes: event.target.value })} />
                </Field>
                {form.trackingLines.length > 1 && canEditTrackingLines ? (
                  <div className="flex items-end">
                    <Button type="button" variant="danger" disabled={removingTrackingId === line.id} onClick={() => void removeTrackingLine(index)}>
                      {removingTrackingId === line.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="pt-1">
              <Button type="button" variant="secondary" disabled={!canEditTrackingLines} onClick={addTrackingLine}>
                + Add Another Tracking Number
              </Button>
            </div>
          </section>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || (!isClientPortal && clients.length === 0) || statuses.length === 0}>
              {saving ? "Saving..." : shipmentId ? "Save Changes" : "Save shipment"}
            </Button>
            <Link href="/incoming-shipments" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function normalizeShipmentLines(lines: ShipmentLine[]) {
  const seenIds = new Set<string>();

  return lines.filter((line) => {
    if (!line.product_id && !line.new_product_name.trim()) {
      return false;
    }

    if (!line.id) {
      return true;
    }

    if (seenIds.has(line.id)) {
      return false;
    }

    seenIds.add(line.id);
    return true;
  });
}

function normalizeTrackingLines(lines: TrackingLine[]) {
  const seenIds = new Set<string>();

  return lines.filter((line) => {
    if (!line.tracking_number.trim() && !line.notes.trim()) {
      return false;
    }

    if (!line.id) {
      return true;
    }

    if (seenIds.has(line.id)) {
      return false;
    }

    seenIds.add(line.id);
    return true;
  });
}

function findDuplicateProduct(lines: ShipmentLine[]) {
  const seenProductIds = new Set<string>();

  for (const line of lines) {
    if (!line.product_id) continue;
    if (seenProductIds.has(line.product_id)) return line.product_id;
    seenProductIds.add(line.product_id);
  }

  return null;
}

function findDuplicateTracking(lines: TrackingLine[]) {
  const seenTrackingNumbers = new Set<string>();

  for (const line of lines) {
    const trackingNumber = line.tracking_number.trim().toLowerCase();
    if (!trackingNumber) continue;
    if (seenTrackingNumbers.has(trackingNumber)) return trackingNumber;
    seenTrackingNumbers.add(trackingNumber);
  }

  return null;
}
