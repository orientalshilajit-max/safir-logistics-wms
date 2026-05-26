"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type TrackingBox = Tables<"incoming_tracking_boxes">;
type ShipmentItem = Tables<"incoming_items"> & {
  products: Product | null;
};
type Shipment = Tables<"incoming_shipments"> & {
  clients: Client | null;
  incoming_items: ShipmentItem[];
  incoming_tracking_boxes: TrackingBox[];
  statuses: Status | null;
};
type ItemDraft = {
  boxes: string;
  damaged: string;
  missing: string;
  notes: string;
  received: string;
};

export function ShipmentDetailClient({ shipmentId }: { shipmentId: string }) {
  const { clientId, role } = useAuth();
  const isAdmin = role === "admin" || role === "warehouse_operator";
  const isClientPortal = role === "client";
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [issueMode, setIssueMode] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadShipment = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(*, products(id, product_name, sku)), incoming_tracking_boxes(*)")
      .eq("id", shipmentId)
      .is("deleted_at", null);

    if (isClientPortal && clientId) {
      query.eq("client_id", clientId);
    }

    const { data, error: shipmentError } = await query.single();

    if (shipmentError) {
      setError(shipmentError.message);
      setShipment(null);
      setLoading(false);
      return;
    }

    const loadedShipment = data as unknown as Shipment;
    const sortedItems = loadedShipment.incoming_items
      .filter((item) => !item.deleted_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    setShipment({ ...loadedShipment, incoming_items: sortedItems });
    setDrafts(
      Object.fromEntries(
        sortedItems.map((item) => {
          const received =
            item.received_quantity === 0 && !item.inventory_posted_at
              ? item.expected_quantity
              : item.received_quantity;

          return [
            item.id,
            {
              damaged: String(item.damaged_quantity),
              missing: String(item.missing_quantity),
              notes: item.notes ?? "",
              boxes: String(item.received_boxes ?? item.expected_boxes),
              received: String(received),
            },
          ];
        }),
      ),
    );
    setIssueMode(
      Object.fromEntries(
        sortedItems.map((item) => [
          item.id,
          hasItemIssue(item) ||
            (item.received_boxes !== null &&
              item.received_boxes !== item.expected_boxes),
        ]),
      ),
    );

    const { data: statusData, error: statusError } = await supabase
      .from("statuses")
      .select("id, name, color")
      .eq("category", "incoming_shipment")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order");

    if (statusError) {
      setError(statusError.message);
    } else {
      setStatuses(statusData ?? []);
    }

    setLoading(false);
  }, [clientId, isClientPortal, shipmentId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadShipment(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadShipment]);

  const totals = useMemo(() => {
    const items = shipment?.incoming_items ?? [];
    return {
      expected: items.reduce((sum, item) => sum + item.expected_quantity, 0),
      received: items.reduce((sum, item) => sum + (item.received_quantity || item.expected_quantity), 0),
      boxes: items.reduce((sum, item) => sum + item.expected_boxes, 0),
      posted: items.filter((item) => item.inventory_posted_at).length,
      rows: items.length,
    };
  }, [shipment]);

  async function markArrivedAtPrep() {
    if (!shipment || !isAdmin || savingId) return;

    const arrivedStatus = statuses.find((status) => status.name === "Arrived at Prep");

    if (!arrivedStatus) {
      setError("Arrived at Prep status is not configured.");
      return;
    }

    setSavingId("arrived");
    setError(null);
    setMessage(null);

    const { error: shipmentError } = await supabase
      .from("incoming_shipments")
      .update({ status_id: arrivedStatus.id })
      .eq("id", shipment.id);

    if (shipmentError) {
      setError(shipmentError.message);
      setSavingId(null);
      return;
    }

    if (shipment.incoming_tracking_boxes.length > 0) {
      const { error: boxesError } = await supabase
        .from("incoming_tracking_boxes")
        .update({ status: "Delivered" })
        .eq("shipment_id", shipment.id)
        .is("inventory_posted_at", null);

      if (boxesError) {
        setError(boxesError.message);
        setSavingId(null);
        return;
      }
    }

    setMessage("Shipment marked Arrived at Prep.");
    await loadShipment();
    setSavingId(null);
  }

  async function markIssue(item: ShipmentItem) {
    if (!shipment || !isAdmin || savingId) return;

    const issueStatus = statuses.find((status) => status.name === "Issue");

    setIssueMode((current) => ({ ...current, [item.id]: true }));

    if (!issueStatus) {
      return;
    }

    setSavingId(`issue-${item.id}`);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("incoming_shipments")
      .update({ status_id: issueStatus.id })
      .eq("id", shipment.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage("Shipment marked Issue.");
      await loadShipment();
    }

    setSavingId(null);
  }

  async function saveRow(item: ShipmentItem) {
    if (!shipment || !isAdmin || savingId || item.inventory_posted_at) return false;

    const parsed = parseDraft(item, drafts[item.id]);

    if (parsed.error) {
      setError(parsed.error);
      return false;
    }

    setSavingId(`save-${item.id}`);
    setError(null);
    setMessage(null);

    const { error: shipmentError } = await supabase
      .from("incoming_shipments")
      .update({ actual_received_boxes: shipment.incoming_items.reduce((sum, row) => {
        if (row.id === item.id) return sum + parsed.boxes;
        return sum + (drafts[row.id]?.boxes ? Number(drafts[row.id].boxes) : row.received_boxes ?? row.expected_boxes);
      }, 0) })
      .eq("id", shipment.id);

    if (shipmentError) {
      setError(shipmentError.message);
      setSavingId(null);
      return false;
    }

    const { error: itemError } = await supabase
      .from("incoming_items")
      .update({
        damaged_quantity: parsed.damaged,
        missing_quantity: parsed.missing,
        notes: parsed.notes,
        received_boxes: parsed.boxes,
        received_quantity: parsed.received,
      })
      .eq("id", item.id)
      .is("inventory_posted_at", null);

    if (itemError) {
      setError(itemError.message);
      setSavingId(null);
      return false;
    }

    setMessage("Receiving row saved.");
    await supabase.rpc("sync_incoming_shipment_receiving_status", { p_shipment_id: shipment.id });
    await loadShipment();
    setSavingId(null);
    return true;
  }

  async function confirmReceived(item: ShipmentItem) {
    if (!shipment || !isAdmin || savingId || item.inventory_posted_at) return;

    const parsed = parseDraft(item, drafts[item.id]);

    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const hasDiscrepancy =
      parsed.received !== item.expected_quantity ||
      parsed.damaged > 0 ||
      parsed.missing > 0 ||
      parsed.boxes !== item.expected_boxes ||
      item.is_unexpected;

    if (hasDiscrepancy && !window.confirm("This row has an issue. Post actual quantities to inventory?")) {
      return;
    }

    setSavingId(`confirm-${item.id}`);
    setError(null);
    setMessage(null);

    const { error: shipmentError } = await supabase
      .from("incoming_shipments")
      .update({ actual_received_boxes: shipment.incoming_items.reduce((sum, row) => {
        if (row.id === item.id) return sum + parsed.boxes;
        return sum + (drafts[row.id]?.boxes ? Number(drafts[row.id].boxes) : row.received_boxes ?? row.expected_boxes);
      }, 0) })
      .eq("id", shipment.id);

    if (shipmentError) {
      setError(shipmentError.message);
      setSavingId(null);
      return;
    }

    const { error: itemSaveError } = await supabase
      .from("incoming_items")
      .update({
        damaged_quantity: parsed.damaged,
        missing_quantity: parsed.missing,
        notes: parsed.notes,
        received_boxes: parsed.boxes,
        received_quantity: parsed.received,
      })
      .eq("id", item.id)
      .is("inventory_posted_at", null);

    if (itemSaveError) {
      setError(itemSaveError.message);
      setSavingId(null);
      return;
    }

    const { error: postError } = await supabase.rpc("post_incoming_item_to_inventory", {
      p_incoming_item_id: item.id,
      p_received_quantity: parsed.received,
      p_damaged_quantity: parsed.damaged,
      p_missing_quantity: parsed.missing,
    });

    if (postError) {
      setError(postError.message);
      setSavingId(null);
      return;
    }

    if (item.tracking_box_id) {
      const { data: remainingItems, error: remainingError } = await supabase
        .from("incoming_items")
        .select("id")
        .eq("tracking_box_id", item.tracking_box_id)
        .is("deleted_at", null)
        .is("inventory_posted_at", null);

      if (remainingError) {
        setError(remainingError.message);
        setSavingId(null);
        return;
      }

      if ((remainingItems ?? []).length === 0) {
        const { error: boxError } = await supabase
          .from("incoming_tracking_boxes")
          .update({
            inventory_posted_at: new Date().toISOString(),
            status: hasDiscrepancy ? "Issue" : "Received",
          })
          .eq("id", item.tracking_box_id);

        if (boxError) {
          setError(boxError.message);
          setSavingId(null);
          return;
        }
      }
    }

    await supabase.rpc("sync_incoming_shipment_receiving_status", { p_shipment_id: shipment.id });
    setMessage("Inventory updated successfully.");
    await loadShipment();
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
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Summary label="Expected Qty" value={totals.expected} />
        <Summary label="Rows Posted" value={`${totals.posted}/${totals.rows}`} />
        <Summary label="Boxes" value={shipment.actual_received_boxes ?? totals.boxes} />
        <Summary label="Status" value={shipment.statuses?.name ?? "In Transit"} />
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={savingId !== null} onClick={() => void markArrivedAtPrep()}>
            Mark Arrived at Prep
          </Button>
        </div>
      ) : null}

      <Panel title="Receiving">
        {shipment.incoming_items.length === 0 ? (
          <EmptyState title="No product rows" body="This shipment does not have any products attached." />
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[1040px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Expected Qty</th>
                  <th className="px-4 py-3 font-semibold">Actual Qty</th>
                  <th className="px-4 py-3 font-semibold">Boxes</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipment.incoming_items.map((item) => {
                  const draft = drafts[item.id];
                  const parsed = parseDraft(item, draft);
                  const rowIssue =
                    Boolean(parsed.error) ||
                    parsed.received !== item.expected_quantity ||
                    parsed.damaged > 0 ||
                    parsed.missing > 0 ||
                    parsed.boxes !== item.expected_boxes ||
                    item.is_unexpected;
                  const showIssueFields = issueMode[item.id] || rowIssue;

                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {item.products?.product_name ?? "Unknown product"}
                        {item.products?.sku ? (
                          <div className="mt-1 text-xs font-normal text-slate-500">{item.products.sku}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.expected_quantity}</td>
                      <td className="px-4 py-3">
                        {isAdmin && !item.inventory_posted_at ? (
                          <div className="space-y-2">
                            <input
                              className={`${inputClassName} w-28`}
                              min="0"
                              type="number"
                              value={draft?.received ?? String(item.expected_quantity)}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...current[item.id], received: event.target.value },
                                }))
                              }
                            />
                            {showIssueFields ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                  aria-label="Damaged quantity"
                                  className={`${inputClassName} w-28`}
                                  min="0"
                                  placeholder="Damaged"
                                  type="number"
                                  value={draft?.damaged ?? "0"}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...current[item.id], damaged: event.target.value },
                                    }))
                                  }
                                />
                                <input
                                  aria-label="Missing quantity"
                                  className={`${inputClassName} w-28`}
                                  min="0"
                                  placeholder="Missing"
                                  type="number"
                                  value={draft?.missing ?? "0"}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...current[item.id], missing: event.target.value },
                                    }))
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-600">{item.received_quantity || item.expected_quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin && !item.inventory_posted_at ? (
                          <input
                            className={`${inputClassName} w-28`}
                            min="0"
                            type="number"
                            value={draft?.boxes ?? String(item.expected_boxes)}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: { ...current[item.id], boxes: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-slate-600">{item.received_boxes ?? item.expected_boxes}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={rowStatusTone(item, rowIssue, shipment.statuses?.name)}>
                          {rowStatus(item, rowIssue, shipment.statuses?.name)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin && !item.inventory_posted_at ? (
                          <Field label=" ">
                            <input
                              className={inputClassName}
                              value={draft?.notes ?? ""}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...current[item.id], notes: event.target.value },
                                }))
                              }
                            />
                          </Field>
                        ) : (
                          <span className="text-slate-600">{item.notes ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={Boolean(item.inventory_posted_at) || savingId !== null}
                              onClick={() => void saveRow(item)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={Boolean(item.inventory_posted_at) || savingId !== null}
                              onClick={() => setIssueMode((current) => ({ ...current, [item.id]: true }))}
                            >
                              Edit Qty
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={Boolean(item.inventory_posted_at) || savingId !== null}
                              onClick={() => void confirmReceived(item)}
                            >
                              {savingId === `confirm-${item.id}` ? "Posting..." : item.inventory_posted_at ? "Already posted" : "Confirm Received"}
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              disabled={Boolean(item.inventory_posted_at) || savingId !== null}
                              onClick={() => void markIssue(item)}
                            >
                              Mark Issue
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">{item.inventory_posted_at ? "Available" : "View"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
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

function parseDraft(
  item: ShipmentItem,
  draft: ItemDraft | undefined,
) {
  const received = Number(draft?.received ?? item.expected_quantity);
  const damaged = Number(draft?.damaged ?? item.damaged_quantity);
  const missing = Number(draft?.missing ?? item.missing_quantity);
  const boxes = Number(draft?.boxes ?? item.expected_boxes);

  if (!Number.isInteger(received) || received < 0) {
    return { error: "Actual quantity must be a whole number zero or greater." } as const;
  }

  if (!Number.isInteger(damaged) || damaged < 0) {
    return { error: "Damaged quantity must be a whole number zero or greater." } as const;
  }

  if (!Number.isInteger(missing) || missing < 0) {
    return { error: "Missing quantity must be a whole number zero or greater." } as const;
  }

  if (!Number.isInteger(boxes) || boxes < 0) {
    return { error: "Boxes must be a whole number zero or greater." } as const;
  }

  return {
    boxes,
    damaged,
    error: null,
    missing,
    notes: draft?.notes.trim() || null,
    received,
  } as const;
}

function hasItemIssue(item: ShipmentItem) {
  return (
    item.is_unexpected ||
    item.damaged_quantity > 0 ||
    item.missing_quantity > 0 ||
    (item.inventory_posted_at ? item.received_quantity !== item.expected_quantity : false)
  );
}

function rowStatus(item: ShipmentItem, rowIssue: boolean, shipmentStatus?: string) {
  if (rowIssue || shipmentStatus === "Issue") return "Issue";
  if (item.inventory_posted_at) return "Available";
  if (shipmentStatus === "Arrived at Prep") return "Receiving";
  return "In Transit";
}

function rowStatusTone(item: ShipmentItem, rowIssue: boolean, shipmentStatus?: string) {
  const status = rowStatus(item, rowIssue, shipmentStatus);
  if (status === "Available") return "emerald";
  if (status === "Receiving") return "orange";
  if (status === "Issue") return "rose";
  return "blue";
}
