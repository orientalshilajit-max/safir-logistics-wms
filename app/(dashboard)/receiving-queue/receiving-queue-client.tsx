"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Tables, TablesInsert } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type Status = Pick<Tables<"statuses">, "id" | "name">;
type Shipment = Pick<Tables<"incoming_shipments">, "id" | "client_id" | "carrier" | "tracking_numbers" | "status_id"> & {
  clients: Client | null;
  statuses: Status | null;
};
type QueueItem = Tables<"incoming_items"> & {
  products: Product | null;
  incoming_shipments: Shipment | null;
};
type QuantityDraft = {
  received_quantity: string;
  damaged_quantity: string;
  missing_quantity: string;
};

export function ReceivingQueueClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, QuantityDraft>>({});
  const [receivedStatusId, setReceivedStatusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openItems = useMemo(
    () => items.filter((item) => !item.inventory_posted_at).length,
    [items],
  );

  useEffect(() => {
    void loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    setError(null);

    const [itemsResult, statusesResult] = await Promise.all([
      supabase
        .from("incoming_items")
        .select(
          "*, products(id, product_name, sku), incoming_shipments(id, client_id, carrier, tracking_numbers, status_id, clients(id, company_name), statuses(id, name))",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("statuses")
        .select("id, name")
        .eq("category", "incoming_shipment")
        .eq("name", "Received")
        .maybeSingle(),
    ]);

    if (statusesResult.error) {
      setError(statusesResult.error.message);
    } else {
      setReceivedStatusId(statusesResult.data?.id ?? null);
    }

    if (itemsResult.error) {
      setError(itemsResult.error.message);
    } else {
      const loadedItems = (itemsResult.data ?? []) as QueueItem[];
      setItems(loadedItems);
      setDrafts(
        Object.fromEntries(
          loadedItems.map((item) => [
            item.id,
            {
              received_quantity: String(item.received_quantity),
              damaged_quantity: String(item.damaged_quantity),
              missing_quantity: String(item.missing_quantity),
            },
          ]),
        ),
      );
    }

    setLoading(false);
  }

  function updateDraft(id: string, patch: Partial<QuantityDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  async function saveQuantities(item: QueueItem) {
    const draft = drafts[item.id];
    setSavingId(item.id);
    setError(null);

    const { error: updateError } = await supabase
      .from("incoming_items")
      .update({
        received_quantity: Number(draft.received_quantity) || 0,
        damaged_quantity: Number(draft.damaged_quantity) || 0,
        missing_quantity: Number(draft.missing_quantity) || 0,
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadQueue();
    }

    setSavingId(null);
  }

  async function completeReceiving(item: QueueItem) {
    const draft = drafts[item.id];
    const shipment = item.incoming_shipments;

    if (!shipment) {
      setError("This receiving item is missing its shipment relationship.");
      return;
    }

    if (item.inventory_posted_at) {
      setError("This item has already been posted to inventory.");
      return;
    }

    const received = Number(draft.received_quantity) || 0;
    const damaged = Number(draft.damaged_quantity) || 0;
    const missing = Number(draft.missing_quantity) || 0;
    const available = Math.max(received - damaged, 0);
    const now = new Date().toISOString();

    setSavingId(item.id);
    setError(null);

    const { error: itemUpdateError } = await supabase
      .from("incoming_items")
      .update({
        received_quantity: received,
        damaged_quantity: damaged,
        missing_quantity: missing,
        inventory_posted_at: now,
      })
      .eq("id", item.id)
      .is("inventory_posted_at", null);

    if (itemUpdateError) {
      setError(itemUpdateError.message);
      setSavingId(null);
      return;
    }

    const { data: existingInventory, error: inventoryLoadError } = await supabase
      .from("inventory")
      .select("*")
      .eq("client_id", shipment.client_id)
      .eq("product_id", item.product_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (inventoryLoadError) {
      setError(inventoryLoadError.message);
      setSavingId(null);
      return;
    }

    const inventoryPayload: TablesInsert<"inventory"> = {
      client_id: shipment.client_id,
      product_id: item.product_id,
      expected_qty: (existingInventory?.expected_qty ?? 0) + item.expected_quantity,
      received_qty: (existingInventory?.received_qty ?? 0) + received,
      available_qty: (existingInventory?.available_qty ?? 0) + available,
      reserved_qty: existingInventory?.reserved_qty ?? 0,
      processing_qty: existingInventory?.processing_qty ?? 0,
      shipped_qty: existingInventory?.shipped_qty ?? 0,
      damaged_qty: (existingInventory?.damaged_qty ?? 0) + damaged,
    };

    const { error: inventoryError } = existingInventory
      ? await supabase.from("inventory").update(inventoryPayload).eq("id", existingInventory.id)
      : await supabase.from("inventory").insert(inventoryPayload);

    if (inventoryError) {
      setError(inventoryError.message);
      setSavingId(null);
      return;
    }

    await maybeCompleteShipment(shipment.id);
    await loadQueue();
    setSavingId(null);
  }

  async function maybeCompleteShipment(shipmentId: string) {
    if (!receivedStatusId) {
      return;
    }

    const { data: remainingItems } = await supabase
      .from("incoming_items")
      .select("id")
      .eq("shipment_id", shipmentId)
      .is("deleted_at", null)
      .is("inventory_posted_at", null);

    if ((remainingItems ?? []).length === 0) {
      await supabase
        .from("incoming_shipments")
        .update({ status_id: receivedStatusId })
        .eq("id", shipmentId);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inbound"
        title="Receiving Queue"
        description="Enter received, damaged, and missing quantities, then post completed items into inventory."
        action={<StatusBadge tone={openItems > 0 ? "amber" : "emerald"}>{openItems} open</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <Panel title="Receiving items" description="Discrepancies are highlighted before inventory is updated.">
        {loading ? (
          <p className="text-sm text-slate-500">Loading receiving queue...</p>
        ) : items.length === 0 ? (
          <EmptyState title="No receiving items" body="Create incoming shipments with product lines to populate this queue." />
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const draft = drafts[item.id];
              const received = Number(draft?.received_quantity ?? 0);
              const discrepancy = item.expected_quantity !== received;
              const posted = Boolean(item.inventory_posted_at);

              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">
                          {item.products?.product_name ?? "Unknown product"}
                        </h3>
                        <StatusBadge tone={posted ? "emerald" : "amber"}>
                          {posted ? "Posted" : "Pending"}
                        </StatusBadge>
                        {discrepancy ? <StatusBadge tone="rose">Discrepancy</StatusBadge> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.incoming_shipments?.clients?.company_name ?? "Unknown client"} ·{" "}
                        {item.incoming_shipments?.carrier ?? "Unknown carrier"} ·{" "}
                        {item.products?.sku ?? "No SKU"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Expected: {item.expected_quantity}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Field label="Received">
                      <input
                        className={inputClassName}
                        disabled={posted}
                        min="0"
                        type="number"
                        value={draft?.received_quantity ?? "0"}
                        onChange={(event) =>
                          updateDraft(item.id, { received_quantity: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Damaged">
                      <input
                        className={inputClassName}
                        disabled={posted}
                        min="0"
                        type="number"
                        value={draft?.damaged_quantity ?? "0"}
                        onChange={(event) =>
                          updateDraft(item.id, { damaged_quantity: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Missing">
                      <input
                        className={inputClassName}
                        disabled={posted}
                        min="0"
                        type="number"
                        value={draft?.missing_quantity ?? "0"}
                        onChange={(event) =>
                          updateDraft(item.id, { missing_quantity: event.target.value })
                        }
                      />
                    </Field>
                  </div>

                  {discrepancy ? (
                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      Expected quantity does not match received quantity.
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={posted || savingId === item.id}
                      onClick={() => void saveQuantities(item)}
                    >
                      Save quantities
                    </Button>
                    <Button
                      type="button"
                      disabled={posted || savingId === item.id}
                      onClick={() => void completeReceiving(item)}
                    >
                      {savingId === item.id ? "Posting..." : "Complete receiving"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
