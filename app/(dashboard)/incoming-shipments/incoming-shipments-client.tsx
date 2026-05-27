"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
  QuickFilterButton,
  StatusBadge,
} from "@/app/components/wms-ui";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import { ArchiveIcon, PencilIcon, RestoreIcon, TableActionButton, TableActionLink, TrashIcon } from "@/app/components/table-actions";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type TrackingBox = Pick<
  Tables<"incoming_tracking_boxes">,
  "id" | "tracking_number" | "status" | "inventory_posted_at" | "box_count" | "notes" | "carrier"
>;
type IncomingItem = Pick<
  Tables<"incoming_items">,
  | "id"
  | "expected_quantity"
  | "expected_boxes"
  | "received_quantity"
  | "received_boxes"
  | "damaged_quantity"
  | "missing_quantity"
  | "is_unexpected"
  | "inventory_posted_at"
  | "notes"
> & {
  products: Pick<Tables<"products">, "product_name" | "sku" | "asin" | "barcode"> | null;
};
type Shipment = Tables<"incoming_shipments"> & {
  clients: Client | null;
  statuses: Status | null;
  incoming_items: IncomingItem[];
  incoming_tracking_boxes: TrackingBox[];
};

const statusTabs = [
  { label: "All", value: "all" },
  { label: "In Transit", value: "In Transit" },
  { label: "Arrived / Receiving", value: "Arrived at Prep" },
  { label: "Received", value: "Received" },
  { label: "Issue", value: "Issue" },
];
const lifecycleTabs = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "Deleted", value: "deleted" },
];

export function IncomingShipmentsClient({
  initialStatus,
}: {
  initialStatus?: string;
}) {
  const { role, clientId } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => normalizeStatusFilter(initialStatus));
  const [lifecycleFilter, setLifecycleFilter] = useState<"active" | "archived" | "deleted">("active");
  const [dateFilter, setDateFilter] = useState("all");
  const [actionShipmentId, setActionShipmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isClientPortal = role === "client";
  const isAdmin = role === "admin" || role === "warehouse_operator";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const shipmentsQuery = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(id, expected_quantity, expected_boxes, received_quantity, received_boxes, damaged_quantity, missing_quantity, is_unexpected, inventory_posted_at, notes, products(product_name, sku, asin, barcode)), incoming_tracking_boxes(id, tracking_number, status, inventory_posted_at, box_count, notes, carrier)")
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      shipmentsQuery.eq("client_id", clientId);
    }

    if (isClientPortal) {
      shipmentsQuery.is("deleted_at", null).is("archived_at", null);
    }

    const { data, error: shipmentsError } = await shipmentsQuery;

    if (shipmentsError) {
      setError(shipmentsError.message);
      setShipments([]);
    } else {
      setShipments((data ?? []) as Shipment[]);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  const filteredShipments = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return shipments.filter((shipment) => {
      const statusName = getDisplayStatus(shipment);
      const isArchived = Boolean(shipment.archived_at);
      const isDeleted = Boolean(shipment.deleted_at);
      const matchesLifecycle = isClientPortal
        ? !isArchived && !isDeleted
        : lifecycleFilter === "deleted"
          ? isDeleted
          : lifecycleFilter === "archived"
            ? isArchived && !isDeleted
            : !isArchived && !isDeleted;
      const matchesStatus =
        statusFilter === "archived"
          ? isArchived
          : !isArchived && (statusFilter === "all" ? true : statusName === statusFilter);
      const matchesQuery =
        !normalized ||
        shipment.clients?.company_name.toLowerCase().includes(normalized) ||
        shipment.id.toLowerCase().includes(normalized) ||
        (shipment.supplier ?? "").toLowerCase().includes(normalized) ||
        shipment.carrier.toLowerCase().includes(normalized) ||
        (shipment.master_tracking_number ?? "").toLowerCase().includes(normalized) ||
        shipment.tracking_numbers.some((tracking) =>
          tracking.toLowerCase().includes(normalized),
        ) ||
        shipment.incoming_items.some((item) =>
          item.products?.product_name.toLowerCase().includes(normalized) ||
          (item.products?.sku ?? "").toLowerCase().includes(normalized),
        );
      const matchesDate = dateFilter === "all" || isWithinDateFilter(shipment.created_at, dateFilter);

      return matchesLifecycle && matchesStatus && matchesQuery && matchesDate;
    });
  }, [dateFilter, isClientPortal, lifecycleFilter, query, shipments, statusFilter]);

  const shipmentStats = useMemo(() => {
    return shipments.reduce(
      (totals, shipment) => {
        if (shipment.archived_at) return totals;

        const status = getDisplayStatus(shipment);
        if (status === "In Transit") totals.inTransit += 1;
        if (status === "Arrived at Prep" || status === "Received") totals.arrivedReceived += 1;
        if (status === "Issue") totals.needAttention += 1;
        return totals;
      },
      { inTransit: 0, arrivedReceived: 0, needAttention: 0 },
    );
  }, [shipments]);
  const adminShipmentStats = shipmentStats;

  async function handleDeleteOrArchiveShipment(shipment: Shipment) {
    if (actionShipmentId) return;

    const statusName = getDisplayStatus(shipment);
    const hasWarehouseActivity = hasShipmentWarehouseActivity(shipment);
    const canDelete = ["Draft", "Submitted", "In Transit"].includes(shipment.statuses?.name ?? statusName) && !hasWarehouseActivity;

    if (canDelete) {
      const confirmed = window.confirm(
        "Delete shipment?\n\nThis shipment will be permanently deleted if it has no warehouse activity. This action cannot be undone.",
      );
      if (!confirmed) return;

      setActionShipmentId(shipment.id);
      setError(null);

      const { error: deleteError } = await supabase.rpc("delete_incoming_shipment_if_allowed", {
        p_shipment_id: shipment.id,
      });

      if (deleteError) {
        if (deleteError.message.includes("Could not find the function")) {
          const timestamp = new Date().toISOString();
          const { error: directDeleteError } = await supabase
            .from("incoming_shipments")
            .update({ deleted_at: timestamp })
            .eq("id", shipment.id);

          if (directDeleteError) {
            setError(directDeleteError.message);
          } else {
            setShipments((current) =>
              current.map((currentShipment) =>
                currentShipment.id === shipment.id
                  ? { ...currentShipment, deleted_at: timestamp }
                  : currentShipment,
              ),
            );
          }
        } else {
          setError(deleteError.message);
        }
      } else {
        const timestamp = new Date().toISOString();
        setShipments((current) =>
          current.map((currentShipment) =>
            currentShipment.id === shipment.id
              ? { ...currentShipment, deleted_at: timestamp }
              : currentShipment,
          ),
        );
      }

      setActionShipmentId(null);
      return;
    }

    const archiveConfirmed = window.confirm(
      "Delete shipment?\n\nThis shipment already has warehouse activity and cannot be permanently deleted. It will be archived instead.",
    );
    if (!archiveConfirmed) return;

    setActionShipmentId(shipment.id);
    setError(null);

    const archivedAt = new Date().toISOString();
    const { error: archiveError } = await supabase.rpc("archive_incoming_shipment", {
      p_shipment_id: shipment.id,
    });

    if (archiveError) {
      if (archiveError.message.includes("Could not find the function")) {
        const { error: directArchiveError } = await supabase
          .from("incoming_shipments")
          .update({ archived_at: archivedAt })
          .eq("id", shipment.id);

        if (directArchiveError) {
          setError(directArchiveError.message);
        } else {
          setMessage("This shipment already has warehouse activity and cannot be deleted. It was archived instead.");
          setShipments((current) =>
            current.map((currentShipment) =>
              currentShipment.id === shipment.id
                ? { ...currentShipment, archived_at: archivedAt }
                : currentShipment,
            ),
          );
        }
      } else {
        setError(archiveError.message);
      }
    } else {
      setMessage("This shipment already has warehouse activity and cannot be deleted. It was archived instead.");
      setShipments((current) =>
        current.map((currentShipment) =>
          currentShipment.id === shipment.id
            ? { ...currentShipment, archived_at: archivedAt }
            : currentShipment,
        ),
      );
    }

    setActionShipmentId(null);
  }

  async function handleRestoreShipment(shipment: Shipment) {
    if (actionShipmentId || !isAdmin) return;

    const confirmed = window.confirm("Restore this shipment to Active?");
    if (!confirmed) return;

    setActionShipmentId(shipment.id);
    setError(null);
    setMessage(null);

    const { error: restoreError } = await supabase.rpc("restore_incoming_shipment", {
      p_shipment_id: shipment.id,
    });

    if (restoreError) {
      if (restoreError.message.includes("Could not find the function")) {
        const { error: directRestoreError } = await supabase
          .from("incoming_shipments")
          .update({
            archived_at: null,
            deleted_at: null,
            restored_at: new Date().toISOString(),
          })
          .eq("id", shipment.id);

        if (directRestoreError) {
          setError(directRestoreError.message);
        } else {
          setMessage("Shipment restored.");
          setShipments((current) =>
            current.map((currentShipment) =>
              currentShipment.id === shipment.id
                ? { ...currentShipment, archived_at: null, deleted_at: null, restored_at: new Date().toISOString() }
                : currentShipment,
            ),
          );
        }
      } else {
        setError(restoreError.message);
      }
    } else {
      setMessage("Shipment restored.");
      setShipments((current) =>
        current.map((currentShipment) =>
          currentShipment.id === shipment.id
            ? { ...currentShipment, archived_at: null, deleted_at: null, restored_at: new Date().toISOString() }
            : currentShipment,
        ),
      );
    }

    setActionShipmentId(null);
  }

  if (isClientPortal) {
    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />
        {message ? <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">{message}</div> : null}

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Incoming Shipments</h2>
          <Link
            href="/incoming-shipments/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Create Shipment
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <ClientStat label="In Transit" value={shipmentStats.inTransit} sublabel="Shipments on the way" />
          <ClientStat label="Arrived / Received" value={shipmentStats.arrivedReceived} sublabel="At prep or completed" />
          <ClientStat label="Need Attention" value={shipmentStats.needAttention} sublabel="Issue or discrepancy" />
        </section>

        <Panel title="Incoming Shipments">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <input
              className={inputClassName}
              placeholder="Search by shipment ID or tracking number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusTabs.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label === "Arrived at Prep" ? "Receiving" : tab.label}
                </option>
              ))}
            </select>
            <select
              className={inputClassName}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading shipments..." />
          ) : filteredShipments.length === 0 ? (
            <EmptyState title="No shipments found" body="Create an incoming shipment or adjust the filters." />
          ) : (
            <div className="space-y-4">
              <div className="max-h-[42rem] overflow-auto">
                <ClientShipmentsTable
                  shipments={filteredShipments}
                  showClient={false}
                  actionShipmentId={actionShipmentId}
                  lifecycleFilter="active"
                  onRestore={handleRestoreShipment}
                  onDeleteOrArchive={handleDeleteOrArchiveShipment}
                  isAdmin={false}
                />
              </div>
            </div>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />
      {message ? <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">{message}</div> : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Incoming Shipments</h2>
        <Link
          href="/incoming-shipments/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          <span className="mr-2 text-base leading-none">+</span>
          Create Shipment
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <ClientStat label="In Transit" value={adminShipmentStats.inTransit} sublabel="Shipments on the way" />
        <ClientStat label="Arrived / Received" value={adminShipmentStats.arrivedReceived} sublabel="At prep or completed" />
        <ClientStat label="Need Attention" value={adminShipmentStats.needAttention} sublabel="Issue or discrepancy" />
      </section>

      <Panel title="Incoming shipments">
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {lifecycleTabs.map((tab) => (
              <QuickFilterButton
                key={tab.value}
                active={lifecycleFilter === tab.value}
                onClick={() => {
                  setLifecycleFilter(tab.value as typeof lifecycleFilter);
                  setStatusFilter("all");
                }}
              >
                {tab.label}
              </QuickFilterButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <QuickFilterButton
                key={tab.value}
                active={statusFilter === tab.value}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </QuickFilterButton>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <input
              className={inputClassName}
              placeholder="Search shipment ID, product, tracking number, supplier"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading shipments..." />
        ) : filteredShipments.length === 0 ? (
          <EmptyState
            title="No shipments found"
            body="Add an incoming shipment or adjust the filters."
          />
        ) : (
          <div className="max-h-[42rem] overflow-auto">
            <ClientShipmentsTable
              shipments={filteredShipments}
              showClient
              actionShipmentId={actionShipmentId}
              lifecycleFilter={lifecycleFilter}
              onRestore={handleRestoreShipment}
              onDeleteOrArchive={handleDeleteOrArchiveShipment}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

export function getShipmentSummary(shipment: Shipment) {
  const itemBoxes = shipment.incoming_items.reduce((sum, item) => sum + defaultBoxCount(item.expected_boxes), 0);
  const trackingBoxes = shipment.incoming_tracking_boxes.reduce((sum, box) => sum + defaultBoxCount(box.box_count), 0);
  const deliveredBoxes = shipment.incoming_tracking_boxes.filter((box) =>
    ["Delivered", "Received", "Issue"].includes(box.status),
  ).reduce((sum, box) => sum + defaultBoxCount(box.box_count), 0);
  const expectedUnits = shipment.incoming_items.reduce(
    (sum, item) => sum + item.expected_quantity,
    0,
  );
  const receivedUnits = shipment.incoming_items.reduce(
    (sum, item) => sum + item.received_quantity,
    0,
  );
  const issueCount =
    shipment.incoming_tracking_boxes.filter((box) => box.status === "Issue").length +
    shipment.incoming_items.filter(
      (item) =>
        item.is_unexpected ||
        (item.inventory_posted_at && item.expected_quantity !== item.received_quantity) ||
        (item.inventory_posted_at && item.expected_boxes !== (item.received_boxes ?? item.expected_boxes)) ||
        item.damaged_quantity > 0 ||
        item.missing_quantity > 0,
    ).length;

  return {
    deliveredBoxes,
    expectedUnits,
    issueCount,
    receivedUnits,
    totalBoxes: shipment.number_of_boxes > 0 ? shipment.number_of_boxes : trackingBoxes || itemBoxes || 1,
    trackingRows: trackingBoxes || itemBoxes || 1,
  };
}

function defaultBoxCount(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value : 1;
}

function ClientStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

function ClientShipmentsTable({
  actionShipmentId,
  isAdmin,
  lifecycleFilter,
  onDeleteOrArchive,
  onRestore,
  shipments,
  showClient,
}: {
  actionShipmentId: string | null;
  isAdmin: boolean;
  lifecycleFilter: "active" | "archived" | "deleted";
  onDeleteOrArchive: (shipment: Shipment) => void;
  onRestore: (shipment: Shipment) => void;
  shipments: Shipment[];
  showClient: boolean;
}) {
  return (
    <table className="w-full min-w-[940px] table-fixed text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[0.68rem] font-medium text-slate-500 backdrop-blur">
        <tr>
          <th className="w-24 px-2.5 py-2.5 font-semibold">Shipment ID</th>
          <th className="w-24 px-2.5 py-2.5 font-semibold">Created Date</th>
          {showClient ? <th className="w-36 px-2.5 py-2.5 font-semibold">Client</th> : null}
          <th className="w-44 px-2.5 py-2.5 font-semibold">Products</th>
          <th className="w-16 px-2 py-2.5 text-center font-semibold">Boxes</th>
          <th className="w-20 px-2 py-2.5 text-center font-semibold">Units</th>
          <th className="w-36 px-2.5 py-2.5 font-semibold">Tracking</th>
          <th className="w-28 px-2.5 py-2.5 font-semibold">Carrier</th>
          <th className="w-28 px-2.5 py-2.5 font-semibold">Status</th>
          <th className="w-20 px-2.5 py-2.5 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {shipments.map((shipment) => {
          const summary = getShipmentSummary(shipment);
          const statusName = getDisplayStatus(shipment);

          return (
            <tr key={shipment.id} className="cursor-pointer bg-white transition hover:bg-slate-50/80">
              <td className="px-2.5 py-2.5 font-medium text-blue-700">
                <Link href={`/incoming-shipments/${shipment.id}`}>{shipment.id.slice(0, 8)}</Link>
              </td>
              <td className="px-2.5 py-2.5 text-slate-600">{formatCompactDate(shipment.created_at)}</td>
              {showClient ? (
                <td className="truncate px-2.5 py-2.5 font-medium text-slate-950">{shipment.clients?.company_name ?? "Unknown"}</td>
              ) : null}
              <td className="px-2.5 py-2.5 text-slate-700">
                <p className="line-clamp-2 whitespace-normal break-words leading-snug">{formatProductSummary(shipment)}</p>
                {shipment.supplier ? <p className="mt-0.5 truncate text-xs text-slate-500">{shipment.supplier}</p> : null}
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 text-center text-slate-700">{summary.totalBoxes}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-center text-slate-700">{summary.expectedUnits}</td>
              <td className="truncate px-2.5 py-2.5 text-slate-600">{shipment.master_tracking_number ?? shipment.tracking_numbers[0] ?? "-"}</td>
              <td className="truncate px-2.5 py-2.5 text-slate-600">{shipment.carrier || "-"}</td>
              <td className="px-2.5 py-2.5">
                  <StatusBadge tone={statusTone(statusName)}>{statusName === "Arrived at Prep" ? "Receiving" : statusName}</StatusBadge>
              </td>
              <td className="px-2.5 py-2.5">
                <div className="flex justify-end gap-0.5">
                  {lifecycleFilter === "active" ? (
                    <>
                      <TableActionLink
                        href={`/incoming-shipments/${shipment.id}/edit`}
                        aria-label={`Edit shipment ${shipment.id.slice(0, 8)}`}
                        title="Edit"
                      >
                        <PencilIcon />
                      </TableActionLink>
                      <TableActionButton
                        aria-label={`${hasShipmentWarehouseActivity(shipment) ? "Archive" : "Delete"} shipment ${shipment.id.slice(0, 8)}`}
                        disabled={actionShipmentId === shipment.id}
                        onClick={() => onDeleteOrArchive(shipment)}
                        title={hasShipmentWarehouseActivity(shipment) ? "Archive Shipment" : "Delete Shipment"}
                        tone={hasShipmentWarehouseActivity(shipment) ? "neutral" : "danger"}
                      >
                        {hasShipmentWarehouseActivity(shipment) ? <ArchiveIcon /> : <TrashIcon />}
                      </TableActionButton>
                    </>
                  ) : isAdmin ? (
                    <TableActionButton
                      aria-label={`Restore shipment ${shipment.id.slice(0, 8)}`}
                      disabled={actionShipmentId === shipment.id}
                      onClick={() => onRestore(shipment)}
                      title="Restore Shipment"
                      tone="primary"
                    >
                      <RestoreIcon />
                    </TableActionButton>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function hasShipmentWarehouseActivity(shipment: Shipment) {
  const statusName = getDisplayStatus(shipment);
  const rawStatusName = shipment.statuses?.name ?? statusName;

  return (
    Boolean(shipment.archived_at) ||
    ["Arrived at Prep", "Receiving", "Received", "Completed", "Issue", "Posted to Inventory"].includes(rawStatusName) ||
    ["Arrived at Prep", "Received", "Issue"].includes(statusName) ||
    shipment.incoming_items.some((item) => Boolean(item.inventory_posted_at)) ||
    shipment.incoming_tracking_boxes.some((box) => Boolean(box.inventory_posted_at))
  );
}

function formatProductSummary(shipment: Shipment) {
  const names = shipment.incoming_items
    .map((item) => item.products?.product_name)
    .filter(Boolean);

  if (names.length === 0) {
    return "-";
  }

  if (names.length === 1) {
    return names[0];
  }

  return `${names[0]} +${names.length - 1}`;
}

export function getDisplayStatus(shipment: Shipment) {
  const summary = getShipmentSummary(shipment);
  const statusName = shipment.statuses?.name ?? "In Transit";

  if (summary.issueCount > 0 || statusName === "Issue" || statusName === "Received with Discrepancy") {
    return "Issue";
  }

  if (statusName === "Received" || statusName === "Completed") {
    return "Received";
  }

  if (
    statusName === "Receiving" ||
    statusName === "Arrived at Prep" ||
    statusName === "Pending Receiving" ||
    statusName === "Partially Received" ||
    statusName === "Delivered" ||
    (summary.totalBoxes > 0 && summary.deliveredBoxes > 0)
  ) {
    return "Arrived at Prep";
  }

  return "In Transit";
}

function normalizeStatusFilter(value?: string) {
  if (value === "pending_receiving" || value === "arrived_at_prep") return "Arrived at Prep";
  if (value === "received") return "Received";
  if (value === "in_transit") return "In Transit";
  if (value === "discrepancy_issue" || value === "issue") return "Issue";
  if (value === "archived") return "archived";
  return "all";
}

function statusTone(status: string) {
  if (status === "Received") return "emerald";
  if (status === "Issue") return "rose";
  if (status === "Arrived at Prep") return "orange";
  return "blue";
}

function isWithinDateFilter(value: string, filter: string) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);

  if (filter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    return true;
  }

  return date >= start && date <= now;
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
