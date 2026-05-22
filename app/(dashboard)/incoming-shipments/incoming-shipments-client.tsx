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
  LoadingState,
  Panel,
  QuickFilterButton,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";
import { ActivityTimeline } from "@/app/components/activity-timeline";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "client_id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type Shipment = Tables<"incoming_shipments"> & {
  clients: Client | null;
  statuses: Status | null;
  incoming_items: { id: string }[];
};
type ShipmentLine = {
  product_id: string;
  expected_quantity: string;
  notes: string;
};
type ShipmentForm = {
  client_id: string;
  carrier: string;
  tracking_numbers: string;
  number_of_boxes: string;
  expected_arrival_date: string;
  notes: string;
  status_id: string;
  lines: ShipmentLine[];
};

const emptyLine: ShipmentLine = {
  product_id: "",
  expected_quantity: "1",
  notes: "",
};

const emptyForm: ShipmentForm = {
  client_id: "",
  carrier: "",
  tracking_numbers: "",
  number_of_boxes: "1",
  expected_arrival_date: "",
  notes: "",
  status_id: "",
  lines: [emptyLine],
};

export function IncomingShipmentsClient() {
  const { role, clientId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [form, setForm] = useState<ShipmentForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const availableProducts = useMemo(
    () => products.filter((product) => product.client_id === form.client_id),
    [form.client_id, products],
  );
  const filteredShipments = useMemo(
    () =>
      shipments.filter(
        (shipment) => statusFilter === "all" || shipment.statuses?.name === statusFilter,
      ),
    [shipments, statusFilter],
  );

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
      .order("product_name");
    const statusesQuery = supabase
      .from("statuses")
      .select("id, name, color")
      .eq("category", "incoming_shipment")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order");
    const shipmentsQuery = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(id)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      clientsQuery.eq("id", clientId);
      productsQuery.eq("client_id", clientId);
      shipmentsQuery.eq("client_id", clientId);
    }

    const [clientsResult, productsResult, statusesResult, shipmentsResult] = await Promise.all([
      clientsQuery,
      productsQuery,
      statusesQuery,
      shipmentsQuery,
    ]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (productsResult.error) setError(productsResult.error.message);
    else setProducts(productsResult.data ?? []);

    if (statusesResult.error) {
      setError(statusesResult.error.message);
    } else {
      const loadedStatuses = statusesResult.data ?? [];
      setStatuses(loadedStatuses);
      setForm((current) => ({
        ...current,
        client_id: isClientPortal && clientId ? clientId : current.client_id,
        status_id:
          current.status_id ||
          loadedStatuses.find((status) => status.name === "Expected")?.id ||
          loadedStatuses[0]?.id ||
          "",
      }));
    }

    if (shipmentsResult.error) setError(shipmentsResult.error.message);
    else {
      const loadedShipments = (shipmentsResult.data ?? []) as Shipment[];
      setShipments(loadedShipments);
      setSelectedShipmentId((current) => current ?? loadedShipments[0]?.id ?? null);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  function updateLine(index: number, line: ShipmentLine) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((currentLine, currentIndex) =>
        currentIndex === index ? line : currentLine,
      ),
    }));
  }

  function removeLine(index: number) {
    if (!window.confirm("Remove this product line?")) {
      return;
    }

    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    const numberOfBoxes = Number(form.number_of_boxes);
    const validLines = form.lines.filter((line) => line.product_id);

    if (validLines.length === 0) {
      setError("Add at least one product line.");
      setSaving(false);
      return;
    }

    if (!Number.isInteger(numberOfBoxes) || numberOfBoxes < 0) {
      setError("Box count must be a whole number zero or greater.");
      setSaving(false);
      return;
    }

    for (const line of validLines) {
      const expectedQuantity = Number(line.expected_quantity);

      if (!Number.isInteger(expectedQuantity) || expectedQuantity < 0) {
        setError("Expected quantities must be whole numbers zero or greater.");
        setSaving(false);
        return;
      }
    }

    const { data: shipment, error: shipmentError } = await supabase
      .from("incoming_shipments")
      .insert({
        client_id: form.client_id,
        carrier: form.carrier.trim(),
        tracking_numbers: form.tracking_numbers
          .split(/[\n,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
        number_of_boxes: numberOfBoxes,
        expected_arrival_date: form.expected_arrival_date || null,
        notes: form.notes.trim() || null,
        status_id: form.status_id,
      })
      .select("id")
      .single();

    if (shipmentError || !shipment) {
      setError(shipmentError?.message ?? "Unable to create shipment.");
      setSaving(false);
      return;
    }

    const { error: itemsError } = await supabase.from("incoming_items").insert(
      validLines.map((line) => ({
        shipment_id: shipment.id,
        product_id: line.product_id,
        expected_quantity: Number(line.expected_quantity) || 0,
        notes: line.notes.trim() || null,
      })),
    );

    if (itemsError) {
      setError(itemsError.message);
    } else {
      setForm({
        ...emptyForm,
        status_id:
          statuses.find((status) => status.name === "Expected")?.id ||
          statuses[0]?.id ||
          "",
      });
      await loadData();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="xl:col-span-2">
          <StatusBadge tone="blue">{shipments.length} shipments</StatusBadge>
        </div>
        <Panel title="Shipment list" description="Inbound records from Supabase.">
          <div className="mb-4 flex flex-wrap gap-2">
            <QuickFilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All
            </QuickFilterButton>
            {statuses.slice(0, 5).map((status) => (
              <QuickFilterButton
                key={status.id}
                active={statusFilter === status.name}
                onClick={() => setStatusFilter(status.name)}
              >
                {status.name}
              </QuickFilterButton>
            ))}
          </div>
          {loading ? (
            <LoadingState label="Loading shipments..." />
          ) : filteredShipments.length === 0 ? (
            <EmptyState
              title="No shipments match this view"
              body={
                isClientPortal
                  ? "No shipments are visible for this status yet. Try another filter or add an inbound shipment."
                  : "Try another status chip or create an inbound shipment to populate the receiving queue."
              }
            />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Carrier</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Tracking</th>
                    <th className="px-4 py-3 font-semibold">Boxes</th>
                    <th className="px-4 py-3 font-semibold">Items</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShipments.map((shipment) => (
                    <tr
                      key={shipment.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedShipmentId(shipment.id)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{shipment.carrier}</td>
                      <td className="px-4 py-3 text-slate-600">{shipment.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{shipment.tracking_numbers.join(", ") || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{shipment.number_of_boxes}</td>
                      <td className="px-4 py-3 text-slate-600">{shipment.incoming_items.length}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={(shipment.statuses?.color ?? "slate") as "slate"}>
                          {shipment.statuses?.name ?? "Unknown"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title={isClientPortal ? "Create my incoming shipment" : "Create incoming shipment"}>
            <form className="space-y-4" onSubmit={(event) => void createShipment(event)}>
            {isClientPortal ? null : (
              <Field label="Client">
                <select
                  className={inputClassName}
                  required
                  value={form.client_id}
                  onChange={(event) => setForm({ ...form, client_id: event.target.value, lines: [emptyLine] })}
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Carrier">
                <input className={inputClassName} required value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
              </Field>
              <Field label="Boxes">
                <input className={inputClassName} min="0" type="number" value={form.number_of_boxes} onChange={(event) => setForm({ ...form, number_of_boxes: event.target.value })} />
              </Field>
            </div>
            <Field label="Tracking numbers">
              <textarea
                className={textAreaClassName}
                placeholder="One per line or comma separated"
                value={form.tracking_numbers}
                onChange={(event) => setForm({ ...form, tracking_numbers: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Expected arrival">
                <input className={inputClassName} type="date" value={form.expected_arrival_date} onChange={(event) => setForm({ ...form, expected_arrival_date: event.target.value })} />
              </Field>
              <Field label="Status">
                <select className={inputClassName} required value={form.status_id} onChange={(event) => setForm({ ...form, status_id: event.target.value })}>
                  <option value="">Select status</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Product lines</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine] })}
                  disabled={!form.client_id}
                >
                  Add line
                </Button>
              </div>
              {form.lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3">
                  <Field label="Product">
                    <select
                      className={inputClassName}
                      required
                      value={line.product_id}
                      onChange={(event) => updateLine(index, { ...line, product_id: event.target.value })}
                    >
                      <option value="">Select product</option>
                      {availableProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.product_name}
                          {product.sku ? ` (${product.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Expected quantity">
                    <input
                      className={inputClassName}
                      min="0"
                      required
                      type="number"
                      value={line.expected_quantity}
                      onChange={(event) => updateLine(index, { ...line, expected_quantity: event.target.value })}
                    />
                  </Field>
                  <Field label="Line notes">
                    <input
                      className={inputClassName}
                      value={line.notes}
                      onChange={(event) => updateLine(index, { ...line, notes: event.target.value })}
                    />
                  </Field>
                  {form.lines.length > 1 ? (
                    <Button type="button" variant="danger" onClick={() => removeLine(index)}>
                      Remove line
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>

              <Button type="submit" disabled={saving || clients.length === 0 || statuses.length === 0}>
                {saving ? "Creating..." : "Create shipment"}
              </Button>
            </form>
          </Panel>
          <ActivityTimeline
            entityType="incoming_shipments"
            entityId={selectedShipmentId}
            title="Shipment activity"
          />
        </div>
      </div>
    </div>
  );
}
