"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Status = Pick<Tables<"statuses">, "id" | "name" | "color">;
type TrackingBox = Pick<
  Tables<"incoming_tracking_boxes">,
  "id" | "tracking_number" | "status" | "inventory_posted_at"
>;
type IncomingItem = Pick<
  Tables<"incoming_items">,
  | "id"
  | "expected_quantity"
  | "received_quantity"
  | "damaged_quantity"
  | "missing_quantity"
  | "is_unexpected"
  | "inventory_posted_at"
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
  { label: "Arrived at Prep", value: "Arrived at Prep" },
  { label: "Received", value: "Received" },
  { label: "Issue", value: "Issue" },
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
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const shipmentsQuery = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(id, expected_quantity, received_quantity, damaged_quantity, missing_quantity, is_unexpected, inventory_posted_at, products(product_name, sku, asin, barcode)), incoming_tracking_boxes(id, tracking_number, status, inventory_posted_at)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      shipmentsQuery.eq("client_id", clientId);
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
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusName === statusFilter;
      const matchesQuery =
        !normalized ||
        shipment.clients?.company_name.toLowerCase().includes(normalized) ||
        shipment.id.toLowerCase().includes(normalized) ||
        shipment.carrier.toLowerCase().includes(normalized) ||
        shipment.tracking_numbers.some((tracking) =>
          tracking.toLowerCase().includes(normalized),
        );
      const matchesDate = dateFilter === "all" || isWithinDateFilter(shipment.created_at, dateFilter);

      return matchesStatus && matchesQuery && matchesDate;
    });
  }, [dateFilter, query, shipments, statusFilter]);

  const selectedShipment = useMemo(
    () => filteredShipments.find((shipment) => shipment.id === selectedShipmentId) ?? filteredShipments[0] ?? null,
    [filteredShipments, selectedShipmentId],
  );

  const shipmentStats = useMemo(() => {
    return shipments.reduce(
      (totals, shipment) => {
        const status = getDisplayStatus(shipment);
        totals.total += 1;
        if (status === "In Transit") totals.inTransit += 1;
        if (status === "Arrived at Prep") totals.receiving += 1;
        if (status === "Received") totals.received += 1;
        return totals;
      },
      { total: 0, inTransit: 0, receiving: 0, received: 0 },
    );
  }, [shipments]);
  const adminShipmentStats = shipmentStats;

  if (isClientPortal) {
    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ClientStat label="Total Shipments" value={shipmentStats.total} sublabel="All time" />
          <ClientStat label="In Transit" value={shipmentStats.inTransit} sublabel="Shipments on the way" />
          <ClientStat label="Receiving / Arrived" value={shipmentStats.receiving} sublabel="At prep center" />
          <ClientStat label="Completed / Received" value={shipmentStats.received} sublabel="Received" />
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
                  selectedShipmentId={selectedShipment?.id ?? null}
                  onSelect={setSelectedShipmentId}
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ClientStat label="Total Shipments" value={adminShipmentStats.total} sublabel="All clients" />
        <ClientStat label="In Transit" value={adminShipmentStats.inTransit} sublabel="Shipments on the way" />
        <ClientStat label="Receiving / Arrived" value={adminShipmentStats.receiving} sublabel="At prep center" />
        <ClientStat label="Completed / Received" value={adminShipmentStats.received} sublabel="Received" />
      </section>

      <Panel title="Incoming shipments">
        <div className="mb-4 space-y-3">
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
          <input
            className={inputClassName}
            placeholder="Search client, shipment, carrier, or tracking"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loading ? (
          <LoadingState label="Loading shipments..." />
        ) : filteredShipments.length === 0 ? (
          <EmptyState
            title="No shipments found"
            body="Add an incoming shipment or adjust the filters."
          />
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[1120px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Shipment ID / Reference</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Tracking progress</th>
                  <th className="px-4 py-3 font-semibold">Boxes</th>
                  <th className="px-4 py-3 font-semibold">Units Expected</th>
                  <th className="px-4 py-3 font-semibold">Units Received</th>
                  <th className="px-4 py-3 font-semibold">Issues</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShipments.map((shipment) => {
                  const summary = getShipmentSummary(shipment);
                  const statusName = getDisplayStatus(shipment);

                  return (
                    <tr key={shipment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {shipment.clients?.company_name ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="font-medium text-slate-950">{shipment.id.slice(0, 8)}</div>
                        <div className="mt-1 text-xs text-slate-500">{shipment.carrier}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(shipment.created_at)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone(statusName)}>{statusName}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {summary.deliveredBoxes}/{summary.totalBoxes} delivered
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {summary.totalBoxes || shipment.number_of_boxes}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{summary.expectedUnits}</td>
                      <td className="px-4 py-3 text-slate-600">{summary.receivedUnits}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={summary.issueCount > 0 ? "rose" : "emerald"}>
                          {summary.issueCount}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/incoming-shipments/${shipment.id}/edit`}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          View
                        </Link>
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

export function getShipmentSummary(shipment: Shipment) {
  const totalBoxes = shipment.incoming_tracking_boxes.length;
  const deliveredBoxes = shipment.incoming_tracking_boxes.filter((box) =>
    ["Delivered", "Received", "Issue"].includes(box.status),
  ).length;
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
        item.damaged_quantity > 0 ||
        item.missing_quantity > 0,
    ).length;

  return {
    deliveredBoxes,
    expectedUnits,
    issueCount,
    receivedUnits,
    totalBoxes: shipment.number_of_boxes || totalBoxes,
    trackingRows: totalBoxes,
  };
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
  shipments,
  selectedShipmentId,
  onSelect,
}: {
  shipments: Shipment[];
  selectedShipmentId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[1100px] text-left text-sm tabular-nums">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
        <tr>
          <th className="px-4 py-3 font-semibold">Shipment ID</th>
          <th className="px-4 py-3 font-semibold">Created Date</th>
          <th className="px-4 py-3 font-semibold">Products</th>
          <th className="px-4 py-3 font-semibold">Boxes</th>
          <th className="px-4 py-3 font-semibold">Units Expected</th>
          <th className="px-4 py-3 font-semibold">Tracking Number</th>
          <th className="px-4 py-3 font-semibold">Carrier</th>
          <th className="px-4 py-3 font-semibold">ETA / Date</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          <th className="px-4 py-3 font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {shipments.map((shipment) => {
          const summary = getShipmentSummary(shipment);
          const statusName = getDisplayStatus(shipment);
          const selected = selectedShipmentId === shipment.id;

          return (
            <Fragment key={shipment.id}>
              <tr
                className={selected ? "bg-blue-50/60" : "cursor-pointer hover:bg-slate-50"}
                onClick={() => onSelect(shipment.id)}
              >
                <td className="px-3 py-2.5 font-medium text-blue-700">{shipment.id.slice(0, 8)}</td>
                <td className="px-3 py-2.5 text-slate-600">{formatDate(shipment.created_at)}</td>
                <td className="px-3 py-2.5 text-slate-600">{shipment.incoming_items.length}</td>
                <td className="px-3 py-2.5 text-slate-600">{shipment.number_of_boxes}</td>
                <td className="px-3 py-2.5 text-slate-600">{summary.expectedUnits}</td>
                <td className="px-3 py-2.5 text-slate-600">{shipment.tracking_numbers[0] ?? "-"}</td>
                <td className="px-3 py-2.5 text-slate-600">{shipment.carrier || "-"}</td>
                <td className="px-3 py-2.5 text-slate-600">{formatDate(shipment.created_at)}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge tone={statusTone(statusName)}>{statusName === "Arrived at Prep" ? "Receiving" : statusName}</StatusBadge>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    aria-label={`Open shipment ${shipment.id.slice(0, 8)}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(shipment.id);
                    }}
                  >
                    {selected ? "-" : "+"}
                  </button>
                </td>
              </tr>
              {selected ? (
                <tr key={`${shipment.id}-details`} className="bg-slate-50/70">
                  <td colSpan={10} className="px-3 py-3">
                    <ClientShipmentDetails shipment={shipment} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function ClientShipmentDetails({ shipment }: { shipment: Shipment }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Shipment {shipment.id.slice(0, 8)}</p>
          <p className="text-xs text-slate-500">Products, boxes, documents, and history</p>
        </div>
        <StatusBadge tone={statusTone(getDisplayStatus(shipment))}>{getDisplayStatus(shipment)}</StatusBadge>
      </div>
      <div className="border-b border-slate-200 px-4 pt-3">
        <div className="flex gap-4 text-sm font-semibold text-slate-600">
          <span className="border-b-2 border-blue-600 pb-3 text-blue-700">Products</span>
          <span className="pb-3">Boxes</span>
          <span className="pb-3">Documents</span>
          <span className="pb-3">History</span>
        </div>
      </div>
      <div className="overflow-auto p-4">
        <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 py-3 font-semibold">SKU</th>
              <th className="px-3 py-3 font-semibold">ASIN / UPC</th>
              <th className="px-3 py-3 font-semibold">Units Expected</th>
              <th className="px-3 py-3 font-semibold">Units Received</th>
              <th className="px-3 py-3 font-semibold">Boxes</th>
              <th className="px-3 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shipment.incoming_items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium text-slate-950">{item.products?.product_name ?? "Unknown product"}</td>
                <td className="px-3 py-3 text-slate-600">{item.products?.sku ?? "-"}</td>
                <td className="px-3 py-3 text-slate-600">{item.products?.asin ?? item.products?.barcode ?? "-"}</td>
                <td className="px-3 py-3 text-slate-600">{item.expected_quantity}</td>
                <td className="px-3 py-3 text-slate-600">{item.inventory_posted_at ? item.received_quantity : "-"}</td>
                <td className="px-3 py-3 text-slate-600">{shipment.number_of_boxes}</td>
                <td className="px-3 py-3 text-slate-600">{item.is_unexpected ? "Unexpected product" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function getDisplayStatus(shipment: Shipment) {
  const summary = getShipmentSummary(shipment);
  const statusName = shipment.statuses?.name ?? "In Transit";

  if (summary.issueCount > 0 || statusName === "Issue" || statusName === "Received with Discrepancy") {
    return "Issue";
  }

  if (statusName === "Received") {
    return statusName;
  }

  if (
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
