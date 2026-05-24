"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityTimeline } from "@/app/components/activity-timeline";
import {
  EmptyState,
  ErrorBanner,
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
type Shipment = Tables<"incoming_shipments"> & {
  clients: Client | null;
  statuses: Status | null;
  incoming_items: { id: string }[];
};

export function IncomingShipmentsClient() {
  const { role, clientId } = useAuth();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClientPortal = role === "client";

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
      shipmentsQuery.eq("client_id", clientId);
    }

    const [statusesResult, shipmentsResult] = await Promise.all([
      statusesQuery,
      shipmentsQuery,
    ]);

    if (statusesResult.error) {
      setError(statusesResult.error.message);
    } else {
      setStatuses(statusesResult.data ?? []);
    }

    if (shipmentsResult.error) {
      setError(shipmentsResult.error.message);
    } else {
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

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex items-center justify-between gap-3 xl:col-span-2">
          <StatusBadge tone="blue">{shipments.length} shipments</StatusBadge>
          <Link
            href="/incoming-shipments/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Incoming Shipment
          </Link>
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
              <table className="w-full min-w-[900px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Carrier</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Tracking</th>
                    <th className="px-4 py-3 font-semibold">Boxes</th>
                    <th className="px-4 py-3 font-semibold">Items</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
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
                      <td className="px-4 py-3">
                        <Link
                          href={`/incoming-shipments/${shipment.id}/edit`}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <ActivityTimeline
          entityType="incoming_shipments"
          entityId={selectedShipmentId}
          title="Shipment activity"
        />
      </div>
    </div>
  );
}
