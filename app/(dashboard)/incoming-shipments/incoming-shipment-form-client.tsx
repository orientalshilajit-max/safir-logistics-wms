"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "client_id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type Shipment = Tables<"incoming_shipments"> & {
  incoming_items: Pick<
    Tables<"incoming_items">,
    "id" | "product_id" | "expected_quantity" | "notes" | "inventory_posted_at"
  >[];
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

export function IncomingShipmentFormClient({ shipmentId }: { shipmentId?: string }) {
  const router = useRouter();
  const { role, clientId } = useAuth();
  const isClientPortal = role === "client";
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [form, setForm] = useState<ShipmentForm>(emptyForm);
  const [hasPostedItems, setHasPostedItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableProducts = useMemo(
    () => products.filter((product) => product.client_id === form.client_id),
    [form.client_id, products],
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
    const shipmentQuery = shipmentId
      ? supabase
        .from("incoming_shipments")
        .select("*, incoming_items(id, product_id, expected_quantity, notes, inventory_posted_at)")
        .eq("id", shipmentId)
        .is("deleted_at", null)
        .single()
      : Promise.resolve({ data: null, error: null });

    if (isClientPortal && clientId) {
      clientsQuery.eq("id", clientId);
      productsQuery.eq("client_id", clientId);
    }

    const [clientsResult, productsResult, statusesResult, shipmentResult] = await Promise.all([
      clientsQuery,
      productsQuery,
      statusesQuery,
      shipmentQuery,
    ]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (productsResult.error) setError(productsResult.error.message);
    else setProducts(productsResult.data ?? []);

    const loadedStatuses = statusesResult.data ?? [];
    if (statusesResult.error) setError(statusesResult.error.message);
    else setStatuses(loadedStatuses);

    if (shipmentResult.error) {
      setError(shipmentResult.error.message);
    } else if (shipmentResult.data) {
      const shipment = shipmentResult.data as Shipment;
      const lines = shipment.incoming_items
        .filter((item) => !("deleted_at" in item))
        .map((item) => ({
          product_id: item.product_id,
          expected_quantity: String(item.expected_quantity),
          notes: item.notes ?? "",
        }));
      setHasPostedItems(shipment.incoming_items.some((item) => Boolean(item.inventory_posted_at)));
      setForm({
        client_id: shipment.client_id,
        carrier: shipment.carrier,
        tracking_numbers: shipment.tracking_numbers.join("\n"),
        number_of_boxes: String(shipment.number_of_boxes),
        expected_arrival_date: shipment.expected_arrival_date ?? "",
        notes: shipment.notes ?? "",
        status_id: shipment.status_id,
        lines: lines.length > 0 ? lines : [emptyLine],
      });
    } else {
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

  async function saveShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    const numberOfBoxes = Number(form.number_of_boxes);
    const validLines = form.lines.filter((line) => line.product_id);

    if (!form.client_id || !form.carrier.trim() || !form.status_id) {
      setError("Client, carrier, and status are required.");
      setSaving(false);
      return;
    }

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

    const shipmentPayload = {
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
    };

    const shipmentResult = shipmentId
      ? await supabase.from("incoming_shipments").update(shipmentPayload).eq("id", shipmentId).select("id").single()
      : await supabase.from("incoming_shipments").insert(shipmentPayload).select("id").single();

    if (shipmentResult.error || !shipmentResult.data) {
      setError(shipmentResult.error?.message ?? "Unable to save shipment.");
      setSaving(false);
      return;
    }

    if (!shipmentId || !hasPostedItems) {
      if (shipmentId) {
        const { error: softDeleteError } = await supabase
          .from("incoming_items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("shipment_id", shipmentId)
          .is("inventory_posted_at", null);

        if (softDeleteError) {
          setError(softDeleteError.message);
          setSaving(false);
          return;
        }
      }

      const { error: itemsError } = await supabase.from("incoming_items").insert(
        validLines.map((line) => ({
          shipment_id: shipmentResult.data.id,
          product_id: line.product_id,
          expected_quantity: Number(line.expected_quantity) || 0,
          notes: line.notes.trim() || null,
        })),
      );

      if (itemsError) {
        setError(itemsError.message);
        setSaving(false);
        return;
      }
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
      <Panel title={shipmentId ? "Edit incoming shipment" : "Add incoming shipment"}>
        <form className="space-y-5" onSubmit={(event) => void saveShipment(event)}>
          <div className="grid gap-4 lg:grid-cols-2">
            {isClientPortal ? null : (
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
            )}
            <Field label="Carrier">
              <input className={inputClassName} required value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
            </Field>
            <Field label="Boxes">
              <input className={inputClassName} min="0" type="number" value={form.number_of_boxes} onChange={(event) => setForm({ ...form, number_of_boxes: event.target.value })} />
            </Field>
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
          <Field label="Tracking numbers">
            <textarea className={textAreaClassName} placeholder="One per line or comma separated" value={form.tracking_numbers} onChange={(event) => setForm({ ...form, tracking_numbers: event.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Product lines</p>
                {hasPostedItems ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Product lines are locked after receiving has posted inventory.
                  </p>
                ) : null}
              </div>
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine] })} disabled={!form.client_id || hasPostedItems}>
                Add line
              </Button>
            </div>
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]">
                <Field label="Product">
                  <select className={inputClassName} required disabled={hasPostedItems} value={line.product_id} onChange={(event) => updateLine(index, { ...line, product_id: event.target.value })}>
                    <option value="">Select product</option>
                    {availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product_name}{product.sku ? ` (${product.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Expected">
                  <input className={inputClassName} min="0" required disabled={hasPostedItems} type="number" value={line.expected_quantity} onChange={(event) => updateLine(index, { ...line, expected_quantity: event.target.value })} />
                </Field>
                <Field label="Line notes">
                  <input className={inputClassName} disabled={hasPostedItems} value={line.notes} onChange={(event) => updateLine(index, { ...line, notes: event.target.value })} />
                </Field>
                {form.lines.length > 1 && !hasPostedItems ? (
                  <div className="flex items-end">
                    <Button type="button" variant="danger" onClick={() => setForm({ ...form, lines: form.lines.filter((_, currentIndex) => currentIndex !== index) })}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || clients.length === 0 || statuses.length === 0}>
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
