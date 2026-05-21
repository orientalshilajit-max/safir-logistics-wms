"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  PageHeader,
  Panel,
  QuickFilterButton,
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
  const [queueFilter, setQueueFilter] = useState<"open" | "discrepancy" | "posted" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openItems = useMemo(
    () => items.filter((item) => !item.inventory_posted_at).length,
    [items],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const draft = drafts[item.id];
        const received = Number(draft?.received_quantity ?? item.received_quantity);
        const damaged = Number(draft?.damaged_quantity ?? item.damaged_quantity);
        const missing = Number(draft?.missing_quantity ?? item.missing_quantity);
        const discrepancy =
          item.expected_quantity !== received || damaged > 0 || missing > 0;
        const posted = Boolean(item.inventory_posted_at);

        if (queueFilter === "open") return !posted;
        if (queueFilter === "posted") return posted;
        if (queueFilter === "discrepancy") return discrepancy;
        return true;
      }),
    [drafts, items, queueFilter],
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

  function validateDraft(item: QueueItem) {
    const draft = drafts[item.id];

    if (!draft) {
      return "Receiving quantities are still loading. Try again in a moment.";
    }

    const quantities = [
      Number(draft.received_quantity),
      Number(draft.damaged_quantity),
      Number(draft.missing_quantity),
    ];

    if (quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
      return "Receiving, damaged, and missing quantities must be zero or greater.";
    }

    if (quantities.some((quantity) => !Number.isInteger(quantity))) {
      return "Receiving quantities must be whole numbers.";
    }

    return null;
  }

  async function saveQuantities(item: QueueItem) {
    if (savingId) {
      return;
    }

    const validationError = validateDraft(item);

    if (validationError) {
      setError(validationError);
      return;
    }

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
    if (savingId) {
      return;
    }

    const validationError = validateDraft(item);

    if (validationError) {
      setError(validationError);
      return;
    }

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
    const hasDiscrepancy =
      item.expected_quantity !== received || damaged > 0 || missing > 0;

    if (
      hasDiscrepancy &&
      !window.confirm(
        "This receiving item has a discrepancy. Post it to inventory anyway?",
      )
    ) {
      return;
    }

    setSavingId(item.id);
    setError(null);

    const { error: inventoryError } = await supabase.rpc("post_incoming_item_to_inventory", {
      p_incoming_item_id: item.id,
      p_received_quantity: received,
      p_damaged_quantity: damaged,
      p_missing_quantity: missing,
    });

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
      const { error: shipmentError } = await supabase
        .from("incoming_shipments")
        .update({ status_id: receivedStatusId })
        .eq("id", shipmentId);

      if (shipmentError) {
        setError(shipmentError.message);
      }
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
        <div className="mb-4 flex flex-wrap gap-2">
          <QuickFilterButton active={queueFilter === "open"} onClick={() => setQueueFilter("open")}>
            Open
          </QuickFilterButton>
          <QuickFilterButton active={queueFilter === "discrepancy"} onClick={() => setQueueFilter("discrepancy")}>
            Discrepancies
          </QuickFilterButton>
          <QuickFilterButton active={queueFilter === "posted"} onClick={() => setQueueFilter("posted")}>
            Posted
          </QuickFilterButton>
          <QuickFilterButton active={queueFilter === "all"} onClick={() => setQueueFilter("all")}>
            All
          </QuickFilterButton>
        </div>
        {loading ? (
          <LoadingState label="Loading receiving queue..." />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="No receiving items in this view"
            body="Try a different quick filter or create an incoming shipment with product lines."
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const draft = drafts[item.id];
              const received = Number(draft?.received_quantity ?? 0);
              const damaged = Number(draft?.damaged_quantity ?? 0);
              const missing = Number(draft?.missing_quantity ?? 0);
              const discrepancy =
                item.expected_quantity !== received || damaged > 0 || missing > 0;
              const posted = Boolean(item.inventory_posted_at);

              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition focus-within:border-slate-300 hover:border-slate-300">
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
                      title="Save quantities"
                      disabled={posted || savingId === item.id}
                      onClick={() => void saveQuantities(item)}
                    >
                      Save quantities
                    </Button>
                    <Button
                      type="button"
                      title="Complete receiving"
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
