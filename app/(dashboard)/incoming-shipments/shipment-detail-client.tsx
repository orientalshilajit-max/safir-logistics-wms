"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type BoxStatus = Tables<"incoming_tracking_boxes">["status"];
type ShipmentItem = Tables<"incoming_items"> & {
  products: Product | null;
};
type TrackingBox = Tables<"incoming_tracking_boxes"> & {
  incoming_items: ShipmentItem[];
};
type Shipment = Tables<"incoming_shipments"> & {
  clients: Client | null;
  statuses: Status | null;
  incoming_tracking_boxes: TrackingBox[];
};

const boxStatuses: BoxStatus[] = ["In Transit", "Delivered", "Received", "Issue"];

export function ShipmentDetailClient({ shipmentId }: { shipmentId: string }) {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "warehouse_operator";
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { received: string; notes: string }>>({});
  const [newLines, setNewLines] = useState<Record<string, { product_id: string; received: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShipment = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: shipmentError } = await supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_tracking_boxes(*, incoming_items(*, products(id, product_name, sku)))")
      .eq("id", shipmentId)
      .is("deleted_at", null)
      .single();

    if (shipmentError) {
      setError(shipmentError.message);
      setShipment(null);
      setLoading(false);
      return;
    }

    const loadedShipment = data as unknown as Shipment;
    setShipment(loadedShipment);
    setDrafts(
      Object.fromEntries(
        loadedShipment.incoming_tracking_boxes.flatMap((box) =>
          box.incoming_items.map((item) => [
            item.id,
            {
              received: String(item.received_quantity),
              notes: item.notes ?? "",
            },
          ]),
        ),
      ),
    );
    setNewLines(
      Object.fromEntries(
        loadedShipment.incoming_tracking_boxes.map((box) => [
          box.id,
          { product_id: "", received: "1", notes: "" },
        ]),
      ),
    );

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("id, product_name, sku")
      .eq("client_id", loadedShipment.client_id)
      .is("deleted_at", null)
      .eq("active", true)
      .order("product_name");

    if (productError) {
      setError(productError.message);
    } else {
      setProducts(productData ?? []);
    }

    setLoading(false);
  }, [shipmentId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadShipment(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadShipment]);

  const totals = useMemo(() => {
    const items = shipment?.incoming_tracking_boxes.flatMap((box) => box.incoming_items) ?? [];
    return {
      expected: items.reduce((sum, item) => sum + item.expected_quantity, 0),
      received: items.reduce((sum, item) => sum + item.received_quantity, 0),
      issues: items.filter((item) => getDifference(item) !== 0 || item.is_unexpected).length,
    };
  }, [shipment]);

  async function updateBoxStatus(box: TrackingBox, status: BoxStatus) {
    if (!isAdmin || savingId) return;

    setSavingId(`box-${box.id}`);
    setError(null);

    const { error: updateError } = await supabase
      .from("incoming_tracking_boxes")
      .update({ status })
      .eq("id", box.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadShipment();
    }

    setSavingId(null);
  }

  async function saveItem(item: ShipmentItem) {
    if (!isAdmin || savingId || item.inventory_posted_at) return;

    const draft = drafts[item.id];
    const received = Number(draft?.received ?? item.received_quantity);

    if (!Number.isInteger(received) || received < 0) {
      setError("Actual quantity must be a whole number zero or greater.");
      return;
    }

    setSavingId(`item-${item.id}`);
    setError(null);

    const { error: updateError } = await supabase
      .from("incoming_items")
      .update({
        received_quantity: received,
        missing_quantity: Math.max(item.expected_quantity - received, 0),
        notes: draft?.notes.trim() || null,
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadShipment();
      await supabase.rpc("sync_incoming_shipment_receiving_status", { p_shipment_id: shipmentId });
    }

    setSavingId(null);
  }

  async function removeItem(item: ShipmentItem) {
    if (!isAdmin || savingId || item.inventory_posted_at) return;
    if (!window.confirm("Remove this product line?")) return;

    setSavingId(`item-${item.id}`);
    setError(null);

    const { error: updateError } = await supabase
      .from("incoming_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadShipment();
      await supabase.rpc("sync_incoming_shipment_receiving_status", { p_shipment_id: shipmentId });
    }

    setSavingId(null);
  }

  async function addUnexpectedLine(event: FormEvent<HTMLFormElement>, box: TrackingBox) {
    event.preventDefault();
    if (!shipment || !isAdmin || savingId || box.inventory_posted_at) return;

    const draft = newLines[box.id];
    const received = Number(draft?.received ?? 0);

    if (!draft?.product_id || !Number.isInteger(received) || received < 0) {
      setError("Choose a product and enter a whole actual quantity.");
      return;
    }

    setSavingId(`new-${box.id}`);
    setError(null);

    const { error: insertError } = await supabase.from("incoming_items").insert({
      shipment_id: shipment.id,
      tracking_box_id: box.id,
      product_id: draft.product_id,
      expected_quantity: 0,
      received_quantity: received,
      missing_quantity: 0,
      notes: draft.notes.trim() || null,
      is_unexpected: true,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      await loadShipment();
      await supabase.rpc("sync_incoming_shipment_receiving_status", { p_shipment_id: shipmentId });
    }

    setSavingId(null);
  }

  async function postBoxToInventory(box: TrackingBox) {
    if (!isAdmin || savingId || box.inventory_posted_at) return;

    const hasDiscrepancy = box.incoming_items.some(
      (item) => getDifference(item) !== 0 || item.is_unexpected,
    );

    if (hasDiscrepancy && !window.confirm("This tracking/box has a discrepancy. Post actual quantities to inventory?")) {
      return;
    }

    setSavingId(`post-${box.id}`);
    setError(null);

    const { error: postError } = await supabase.rpc("post_incoming_tracking_box_to_inventory", {
      p_tracking_box_id: box.id,
    });

    if (postError) {
      setError(postError.message);
    } else {
      await loadShipment();
    }

    setSavingId(null);
  }

  if (loading) {
    return <LoadingState label="Loading shipment..." />;
  }

  if (!shipment) {
    return <EmptyState title="Shipment not found" body="The shipment could not be loaded." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Link href="/incoming-shipments" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Back to shipments
        </Link>
      </div>
      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-4">
        <Summary label="Expected" value={totals.expected} />
        <Summary label="Received" value={totals.received} />
        <Summary label="Issues" value={totals.issues} />
        <Summary label="Status" value={shipment.statuses?.name ?? "Unknown"} />
      </div>

      <Panel title="Tracking / box table">
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm tabular-nums">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
              <tr>
                <th className="px-4 py-3 font-semibold">Tracking Number</th>
                <th className="px-4 py-3 font-semibold">Carrier</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Expected Contents</th>
                <th className="px-4 py-3 font-semibold">Actual Contents</th>
                <th className="px-4 py-3 font-semibold">Difference</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipment.incoming_tracking_boxes.map((box) => {
                const expected = box.incoming_items.reduce((sum, item) => sum + item.expected_quantity, 0);
                const actual = box.incoming_items.reduce((sum, item) => sum + item.received_quantity, 0);
                const difference = actual - expected;

                return (
                  <tr key={box.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-950">{box.tracking_number}</td>
                    <td className="px-4 py-3 text-slate-600">{box.carrier ?? shipment.carrier}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select className={inputClassName} value={box.status} onChange={(event) => void updateBoxStatus(box, event.target.value as BoxStatus)} disabled={Boolean(box.inventory_posted_at)}>
                          {boxStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge tone={boxStatusTone(box.status)}>{box.status}</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{expected}</td>
                    <td className="px-4 py-3 text-slate-600">{actual}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={difference === 0 ? "emerald" : difference > 0 ? "amber" : "rose"}>
                        {difference > 0 ? `+${difference}` : difference}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <Button type="button" disabled={!isAdmin || Boolean(box.inventory_posted_at) || savingId === `post-${box.id}`} onClick={() => void postBoxToInventory(box)}>
                        {box.inventory_posted_at ? "Posted" : savingId === `post-${box.id}` ? "Posting..." : "Post to inventory"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {shipment.incoming_tracking_boxes.map((box) => (
        <Panel key={box.id} title={box.tracking_number} description="Actual contents">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Expected Qty</th>
                  <th className="px-4 py-3 font-semibold">Actual Qty</th>
                  <th className="px-4 py-3 font-semibold">Difference</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {box.incoming_items.map((item) => {
                  const draft = drafts[item.id];
                  const actual = Number(draft?.received ?? item.received_quantity);
                  const difference = actual - item.expected_quantity;

                  return (
                    <tr key={item.id} className={item.is_unexpected ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {item.products?.product_name ?? "Unknown product"}
                        {item.is_unexpected ? <span className="ml-2 text-xs font-semibold text-amber-700">Unexpected</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.expected_quantity}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <input className={inputClassName} disabled={Boolean(item.inventory_posted_at)} min="0" type="number" value={draft?.received ?? "0"} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], received: event.target.value } }))} />
                        ) : (
                          <span className="text-slate-600">{item.received_quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={difference === 0 ? "emerald" : difference > 0 ? "amber" : "rose"}>
                          {difference > 0 ? `+${difference}` : difference}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <input className={inputClassName} disabled={Boolean(item.inventory_posted_at)} value={draft?.notes ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], notes: event.target.value } }))} />
                        ) : (
                          <span className="text-slate-600">{item.notes ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" disabled={!isAdmin || Boolean(item.inventory_posted_at) || savingId === `item-${item.id}`} onClick={() => void saveItem(item)}>
                            Save
                          </Button>
                          <Button type="button" variant="danger" disabled={!isAdmin || Boolean(item.inventory_posted_at) || savingId === `item-${item.id}`} onClick={() => void removeItem(item)}>
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isAdmin && !box.inventory_posted_at ? (
            <form className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_auto]" onSubmit={(event) => void addUnexpectedLine(event, box)}>
              <Field label="Add product">
                <select className={inputClassName} value={newLines[box.id]?.product_id ?? ""} onChange={(event) => setNewLines((current) => ({ ...current, [box.id]: { ...current[box.id], product_id: event.target.value } }))}>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.product_name}{product.sku ? ` (${product.sku})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Actual">
                <input className={inputClassName} min="0" type="number" value={newLines[box.id]?.received ?? "1"} onChange={(event) => setNewLines((current) => ({ ...current, [box.id]: { ...current[box.id], received: event.target.value } }))} />
              </Field>
              <Field label="Notes">
                <textarea className={textAreaClassName} value={newLines[box.id]?.notes ?? ""} onChange={(event) => setNewLines((current) => ({ ...current, [box.id]: { ...current[box.id], notes: event.target.value } }))} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={savingId === `new-${box.id}`}>Add line</Button>
              </div>
            </form>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function getDifference(item: ShipmentItem) {
  return item.received_quantity - item.expected_quantity;
}

function boxStatusTone(status: BoxStatus) {
  if (status === "Received") return "emerald";
  if (status === "Issue") return "rose";
  if (status === "Delivered") return "amber";
  return "blue";
}
