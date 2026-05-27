"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
    "id" | "tracking_number" | "box_count" | "notes" | "status"
  >[];
  statuses: Pick<Tables<"statuses">, "name"> | null;
};
type ShipmentLine = {
  product_id: string;
  new_product_name: string;
  expected_quantity: string;
  expected_boxes: string;
  notes: string;
};
type TrackingLine = {
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
  expected_boxes: "",
  notes: "",
};

const emptyTrackingLine: TrackingLine = {
  tracking_number: "",
  box_count: "",
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

const intakeStatusNames = ["Draft", "Submitted", "In Transit", "Receiving", "Completed"];
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
  const [hasPostedItems, setHasPostedItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableProducts = useMemo(
    () => products.filter((product) => product.client_id === form.client_id),
    [form.client_id, products],
  );
  const canEditProductLines = isAdmin || !shipmentId || ["Draft", "Submitted", "In Transit"].includes(shipmentStatusName);
  const visibleStatuses = useMemo(
    () => statuses.filter((status) => intakeStatusNames.includes(status.name) || status.id === form.status_id),
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
      ? supabase
        .from("incoming_shipments")
        .select("*, statuses(name), incoming_items(id, product_id, expected_quantity, expected_boxes, notes, inventory_posted_at), incoming_tracking_boxes(id, tracking_number, box_count, notes, status)")
        .eq("id", shipmentId)
        .is("deleted_at", null)
        .single()
      : Promise.resolve({ data: null, error: null });

    if (isClientPortal && clientId) {
      clientsQuery.eq("id", clientId);
      productsQuery.eq("client_id", clientId);
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
      setHasPostedItems(shipment.incoming_items.some((item) => Boolean(item.inventory_posted_at)));
      setShipmentStatusName(shipment.statuses?.name ?? "In Transit");
      const trackingLines = shipment.incoming_tracking_boxes.length > 0
        ? shipment.incoming_tracking_boxes.map((box) => ({
          tracking_number: box.tracking_number,
          box_count: box.box_count === null ? "" : String(box.box_count),
          notes: box.notes ?? "",
        }))
        : shipment.master_tracking_number || shipment.tracking_numbers[0]
          ? [{
              tracking_number: shipment.master_tracking_number ?? shipment.tracking_numbers[0] ?? "",
              box_count: shipment.actual_received_boxes === null ? "" : String(shipment.actual_received_boxes),
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
            product_id: item.product_id,
            new_product_name: "",
            expected_quantity: String(item.expected_quantity),
            expected_boxes: String(item.expected_boxes),
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
        client_id: isClientPortal && clientId ? clientId : current.client_id,
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

  function updateTrackingLine(index: number, line: TrackingLine) {
    setForm((current) => ({
      ...current,
      trackingLines: current.trackingLines.map((currentLine, currentIndex) =>
        currentIndex === index ? line : currentLine,
      ),
    }));
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

    if (!isAdmin && shipmentId && !["Draft", "Submitted", "In Transit"].includes(shipmentStatusName)) {
      setError("Shipment quantities can only be edited before the shipment arrives at prep.");
      setSaving(false);
      return;
    }

    const preparedLines = form.lines.filter((line) => line.product_id || line.new_product_name.trim());

    if (preparedLines.length === 0) {
      setError("Add at least one product line.");
      setSaving(false);
      return;
    }

    for (const line of preparedLines) {
      const expectedQuantity = Number(line.expected_quantity);
      const expectedBoxes = line.expected_boxes.trim() === "" ? 0 : Number(line.expected_boxes);

      if (!Number.isInteger(expectedQuantity) || expectedQuantity < 1) {
        setError("Unit quantities must be whole numbers greater than zero.");
        setSaving(false);
        return;
      }

      if (!Number.isInteger(expectedBoxes) || expectedBoxes < 0) {
        setError("Box quantities must be whole numbers zero or greater.");
        setSaving(false);
        return;
      }
    }

    for (const line of form.trackingLines) {
      if (!line.tracking_number.trim() && !line.box_count.trim() && !line.notes.trim()) continue;
      const boxCount = line.box_count.trim() === "" ? null : Number(line.box_count);

      if (boxCount !== null && (!Number.isInteger(boxCount) || boxCount < 0)) {
        setError("Tracking box counts must be whole numbers zero or greater.");
        setSaving(false);
        return;
      }
    }

    const lineProductIds: string[] = [];

    for (const line of preparedLines) {
      if (line.product_id) {
        lineProductIds.push(line.product_id);
        continue;
      }

      const { data: lastProduct } = await supabase
        .from("products")
        .select("sort_order")
        .eq("client_id", form.client_id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const productPayload: TablesInsert<"products"> = {
        client_id: form.client_id,
        product_name: line.new_product_name.trim(),
        active: true,
        sort_order: (lastProduct?.sort_order ?? 0) + 1,
      };
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert(productPayload)
        .select("id")
        .single();

      if (productError || !product) {
        setError(productError?.message ?? "Unable to create product.");
        setSaving(false);
        return;
      }

      lineProductIds.push(product.id);
    }

    const trackingNumbers = form.trackingLines
      .map((line) => line.tracking_number.trim())
      .filter(Boolean);
    const totalBoxes = preparedLines.reduce((sum, line) => sum + (line.expected_boxes.trim() === "" ? 0 : Number(line.expected_boxes)), 0);
    const masterTracking = trackingNumbers[0] ?? "";
    const shipmentPayload = {
      client_id: form.client_id,
      supplier: null,
      carrier: form.carrier.trim(),
      master_tracking_number: masterTracking || null,
      tracking_numbers: Array.from(new Set(trackingNumbers)),
      number_of_boxes: totalBoxes,
      expected_arrival_date: null,
      notes: form.notes.trim() || null,
      status_id: isAdmin ? form.status_id : statuses.find((status) => status.name === "In Transit")?.id ?? form.status_id,
    };

    const shipmentResult = shipmentId
      ? await supabase.from("incoming_shipments").update(shipmentPayload).eq("id", shipmentId).select("id").single()
      : await supabase.from("incoming_shipments").insert(shipmentPayload).select("id").single();

    if (shipmentResult.error || !shipmentResult.data) {
      setError(shipmentResult.error?.message ?? "Unable to save shipment.");
      setSaving(false);
      return;
    }

    const activeShipmentId = shipmentResult.data.id;

    if (!hasPostedItems || isAdmin) {
      const itemDeleteQuery = supabase
        .from("incoming_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("shipment_id", activeShipmentId)
        .is("inventory_posted_at", null);
      const { error: softDeleteError } = await itemDeleteQuery;

      if (softDeleteError) {
        setError(softDeleteError.message);
        setSaving(false);
        return;
      }

      const { error: itemsError } = await supabase.from("incoming_items").insert(
        preparedLines.map((line, index) => ({
          shipment_id: activeShipmentId,
          product_id: lineProductIds[index],
          expected_quantity: Number(line.expected_quantity),
          expected_boxes: line.expected_boxes.trim() === "" ? 0 : Number(line.expected_boxes),
          notes: line.notes.trim() || null,
        })),
      );

      if (itemsError) {
        setError(itemsError.message);
        setSaving(false);
        return;
      }
    }

    const { error: deleteBoxesError } = await supabase
      .from("incoming_tracking_boxes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("shipment_id", activeShipmentId)
      .is("inventory_posted_at", null);

    if (deleteBoxesError) {
      setError(deleteBoxesError.message);
      setSaving(false);
      return;
    }

    const validTrackingRows = form.trackingLines.filter((line) => line.tracking_number.trim());

    if (validTrackingRows.length > 0) {
      const { error: boxesError } = await supabase.from("incoming_tracking_boxes").insert(
        validTrackingRows.map((line) => ({
          shipment_id: activeShipmentId,
          tracking_number: line.tracking_number.trim(),
          carrier: form.carrier.trim() || null,
          box_count: line.box_count.trim() === "" ? null : Number(line.box_count),
          notes: line.notes.trim() || null,
        })),
      );

      if (boxesError) {
        setError(boxesError.message);
        setSaving(false);
        return;
      }
    }

    if (isClientPortal && shipmentId) {
      await supabase.from("notifications").insert({
        client_id: form.client_id,
        entity_id: activeShipmentId,
        entity_type: "incoming_shipments",
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Products</h3>
              </div>
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine] })} disabled={!form.client_id || !canEditProductLines}>
                + Add Another Product
              </Button>
            </div>
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7rem_7rem_minmax(0,1fr)_auto]">
                <Field label="Product">
                  <select className={inputClassName} disabled={!canEditProductLines} value={line.product_id} onChange={(event) => updateLine(index, { ...line, product_id: event.target.value, new_product_name: "" })}>
                    <option value="">Select product</option>
                    {availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product_name}{product.sku ? ` (${product.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="+ Create new product">
                  <input className={inputClassName} placeholder="Product name" disabled={!canEditProductLines || Boolean(line.product_id)} value={line.new_product_name} onChange={(event) => updateLine(index, { ...line, new_product_name: event.target.value })} />
                </Field>
                <Field label="Units">
                  <input className={inputClassName} min="1" required disabled={!canEditProductLines} type="number" value={line.expected_quantity} onChange={(event) => updateLine(index, { ...line, expected_quantity: event.target.value })} />
                </Field>
                <Field label="Boxes">
                  <input className={inputClassName} min="0" disabled={!canEditProductLines} type="number" value={line.expected_boxes} onChange={(event) => updateLine(index, { ...line, expected_boxes: event.target.value })} />
                </Field>
                <Field label="Notes">
                  <input className={inputClassName} disabled={!canEditProductLines} value={line.notes} onChange={(event) => updateLine(index, { ...line, notes: event.target.value })} />
                </Field>
                {form.lines.length > 1 && canEditProductLines ? (
                  <div className="flex items-end">
                    <Button type="button" variant="danger" onClick={() => setForm({ ...form, lines: form.lines.filter((_, currentIndex) => currentIndex !== index) })}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-950">Shipping Information</h3>
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, trackingLines: [...form.trackingLines, emptyTrackingLine] })}>
                + Add Another Tracking Number
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <Field label="Carrier optional">
                <select className={inputClassName} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })}>
                  <option value="">Select carrier</option>
                  {visibleCarrierOptions.map((carrier) => (
                    <option key={carrier.id} value={carrier.name}>
                      {carrier.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes optional">
                <input className={inputClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
            </div>
            {form.trackingLines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_auto]">
                <Field label="Tracking number">
                  <input className={inputClassName} value={line.tracking_number} onChange={(event) => updateTrackingLine(index, { ...line, tracking_number: event.target.value })} />
                </Field>
                <Field label="Box count">
                  <input className={inputClassName} min="0" type="number" value={line.box_count} onChange={(event) => updateTrackingLine(index, { ...line, box_count: event.target.value })} />
                </Field>
                <Field label="Notes">
                  <input className={inputClassName} value={line.notes} onChange={(event) => updateTrackingLine(index, { ...line, notes: event.target.value })} />
                </Field>
                {form.trackingLines.length > 1 ? (
                  <div className="flex items-end">
                    <Button type="button" variant="danger" onClick={() => setForm({ ...form, trackingLines: form.trackingLines.filter((_, currentIndex) => currentIndex !== index) })}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || (!isClientPortal && clients.length === 0) || statuses.length === 0}>
              {saving ? "Saving..." : "Save shipment"}
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
