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
>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const shipmentsQuery = supabase
      .from("incoming_shipments")
      .select("*, clients(id, company_name), statuses(id, name, color), incoming_items(id, expected_quantity, received_quantity, damaged_quantity, missing_quantity, is_unexpected, inventory_posted_at), incoming_tracking_boxes(id, tracking_number, status, inventory_posted_at)")
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

      return matchesStatus && matchesQuery;
    });
  }, [query, shipments, statusFilter]);

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone="blue">{filteredShipments.length} shipments</StatusBadge>
        <Link
          href="/incoming-shipments/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <span className="mr-2 text-base leading-none">+</span>
          Add Shipment
        </Link>
      </div>

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
