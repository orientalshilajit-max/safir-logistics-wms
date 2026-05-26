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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const shipmentsQuery = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(id, expected_quantity, expected_boxes, received_quantity, received_boxes, damaged_quantity, missing_quantity, is_unexpected, inventory_posted_at, notes, products(product_name, sku, asin, barcode)), incoming_tracking_boxes(id, tracking_number, status, inventory_posted_at, box_count, notes, carrier)")
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

      return matchesStatus && matchesQuery && matchesDate;
    });
  }, [dateFilter, query, shipments, statusFilter]);

  const shipmentStats = useMemo(() => {
    return shipments.reduce(
      (totals, shipment) => {
        const status = getDisplayStatus(shipment);
        totals.total += 1;
        if (status === "In Transit") totals.inTransit += 1;
        if (status === "Arrived at Prep") totals.receiving += 1;
        if (status === "Received") totals.received += 1;
        if (status === "Issue") totals.issue += 1;
        return totals;
      },
      { total: 0, inTransit: 0, receiving: 0, received: 0, issue: 0 },
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <ClientStat label="Total Shipments" value={shipmentStats.total} sublabel="All time" />
          <ClientStat label="In Transit" value={shipmentStats.inTransit} sublabel="Shipments on the way" />
          <ClientStat label="Arrived / Receiving" value={shipmentStats.receiving} sublabel="At prep center" />
          <ClientStat label="Received" value={shipmentStats.received} sublabel="Received" />
          <ClientStat label="Issue" value={shipmentStats.issue} sublabel="Needs attention" />
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <ClientStat label="Total Shipments" value={adminShipmentStats.total} sublabel="All clients" />
        <ClientStat label="In Transit" value={adminShipmentStats.inTransit} sublabel="Shipments on the way" />
        <ClientStat label="Arrived / Receiving" value={adminShipmentStats.receiving} sublabel="At prep center" />
        <ClientStat label="Received" value={adminShipmentStats.received} sublabel="Received" />
        <ClientStat label="Issue" value={adminShipmentStats.issue} sublabel="Needs attention" />
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
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

export function getShipmentSummary(shipment: Shipment) {
  const totalBoxes = shipment.incoming_items.reduce((sum, item) => sum + item.expected_boxes, 0);
  const deliveredBoxes = shipment.incoming_tracking_boxes.filter((box) =>
    ["Delivered", "Received", "Issue"].includes(box.status),
  ).reduce((sum, box) => sum + (box.box_count ?? 1), 0);
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
    totalBoxes: totalBoxes || shipment.number_of_boxes,
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
  showClient,
}: {
  shipments: Shipment[];
  showClient: boolean;
}) {
  return (
    <table className="w-full min-w-[1040px] table-fixed text-left text-sm tabular-nums">
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
          <th className="w-24 px-2.5 py-2.5 font-semibold">ETA / Date</th>
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
              <td className="px-2.5 py-2.5 text-slate-600">{shipment.expected_arrival_date ? formatCompactDate(shipment.expected_arrival_date) : "-"}</td>
              <td className="px-2.5 py-2.5">
                  <StatusBadge tone={statusTone(statusName)}>{statusName === "Arrived at Prep" ? "Receiving" : statusName}</StatusBadge>
              </td>
              <td className="px-2.5 py-2.5">
                <div className="flex justify-end gap-0.5">
                  <Link
                    href={`/incoming-shipments/${shipment.id}`}
                    aria-label={`View shipment ${shipment.id.slice(0, 8)}`}
                    title="View"
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <ViewIcon />
                  </Link>
                  <Link
                    href={`/incoming-shipments/${shipment.id}/edit`}
                    aria-label={`Edit shipment ${shipment.id.slice(0, 8)}`}
                    title="Edit"
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <PencilIcon />
                  </Link>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function ViewIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
    </svg>
  );
}
