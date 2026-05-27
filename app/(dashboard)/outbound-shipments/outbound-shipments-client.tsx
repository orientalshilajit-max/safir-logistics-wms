"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import {
  hasMissingBoxLabels,
  LabelManager,
  type RequestBoxOption,
} from "@/app/components/label-manager";
import {
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
  QuickFilterButton,
  StatusBadge,
} from "@/app/components/wms-ui";
import { CLIENT_ACCOUNT_LINK_ERROR } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type ShippingRequest = Tables<"service_requests"> & {
  clients: Client | null;
  request_boxes: RequestBoxOption[];
  shipping_labels: Pick<
    Tables<"shipping_labels">,
    "id" | "label_category" | "request_box_id" | "box_number"
  >[];
};

const outboundStatuses: Tables<"service_requests">["status"][] = [
  "Waiting Labels",
  "Labels Uploaded",
  "Ready to Pack",
  "Packing",
  "Ready to Ship",
  "Shipped",
  "Completed",
];

export function OutboundShipmentsClient() {
  const { clientId, role } = useAuth();
  const [requests, setRequests] = useState<ShippingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isClientPortal = role === "client";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isClientPortal && !clientId) {
      setRequests([]);
      setSelectedRequestId(null);
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setLoading(false);
      return;
    }

    const requestQuery = supabase
      .from("service_requests")
      .select("*, clients(id, company_name), request_boxes(id, box_number, tracking_number), shipping_labels(id, label_category, request_box_id, box_number)")
      .is("deleted_at", null)
      .in("status", outboundStatuses)
      .order("updated_at", { ascending: false });

    if (isClientPortal) {
      requestQuery.eq("client_id", clientId as string);
    }

    const { data, error: requestsError } = await requestQuery;

    if (requestsError) {
      setError(requestsError.message);
      setRequests([]);
    } else {
      const loaded = (data ?? []) as ShippingRequest[];
      setRequests(loaded);
      setSelectedRequestId((current) => current ?? loaded[0]?.id ?? null);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

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

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return requests.filter((request) => {
      const missingLabels = hasMissingBoxLabels(
        request.request_boxes,
        request.shipping_labels,
      );
      const matchesStatus =
        statusFilter === "active" ||
        (statusFilter === "missing_labels" ? missingLabels : request.status === statusFilter);
      const matchesQuery =
        !normalized ||
        request.request_number.toLowerCase().includes(normalized) ||
        request.clients?.company_name.toLowerCase().includes(normalized) ||
        request.tracking_numbers.some((tracking) =>
          tracking.toLowerCase().includes(normalized),
        );

      return matchesStatus && matchesQuery;
    });
  }, [query, requests, statusFilter]);

  function applyLocalStatus(status: Tables<"service_requests">["status"]) {
    if (!selectedRequestId) return;

    setRequests((current) =>
      current.map((request) =>
        request.id === selectedRequestId ? { ...request, status } : request,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_38rem]">
        <div className="2xl:col-span-2">
          <StatusBadge tone="blue">{requests.length} outbound requests</StatusBadge>
        </div>
        <Panel
          title="Outbound queue"
          description="Requests that need labels, packing, shipping, or completion."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["active", "Active"],
              ["missing_labels", "Missing labels"],
              ["Waiting Labels", "Waiting Labels"],
              ["Labels Uploaded", "Labels Uploaded"],
              ["Ready to Pack", "Ready to Pack"],
              ["Ready to Ship", "Ready to Ship"],
            ].map(([value, label]) => (
              <QuickFilterButton
                key={value}
                active={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </QuickFilterButton>
            ))}
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <input
              className={inputClassName}
              placeholder="Search request, client, or tracking"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">All outbound statuses</option>
              <option value="missing_labels">Missing labels</option>
              {outboundStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading outbound queue..." />
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              title="No outbound work found"
              body="Requests appear here when they enter label, packing, or shipping stages."
            />
          ) : (
            <div className="max-h-[40rem] overflow-auto">
              <table className="w-full min-w-[820px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Boxes</th>
                    <th className="px-4 py-3 font-semibold">Labels</th>
                    <th className="px-4 py-3 font-semibold">Tracking</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => {
                    const missingLabels = hasMissingBoxLabels(
                      request.request_boxes,
                      request.shipping_labels,
                    );

                    return (
                      <tr
                        key={request.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedRequestId(request.id)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-950">
                          {request.request_number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {request.clients?.company_name ?? "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{request.request_boxes.length}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge tone={missingLabels ? "amber" : "emerald"}>
                              {missingLabels ? "Missing labels" : "Labels ready"}
                            </StatusBadge>
                            <StatusBadge tone="slate">{request.shipping_labels.length}</StatusBadge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {request.tracking_numbers[0] ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={statusTone(request.status)}>
                            {request.status}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <LabelManager
          clientId={selectedRequest?.client_id ?? null}
          serviceRequestId={selectedRequestId}
          boxes={selectedRequest?.request_boxes ?? []}
          title={selectedRequest ? `${selectedRequest.request_number} labels` : "Outbound labels"}
          onLabelsChange={loadData}
          onStatusChange={applyLocalStatus}
        />
      </div>
    </div>
  );
}

function statusTone(status: Tables<"service_requests">["status"]) {
  if (status === "Shipped" || status === "Completed" || status === "Labels Uploaded") {
    return "emerald";
  }

  if (status === "Waiting Labels") {
    return "amber";
  }

  if (status === "Ready to Pack" || status === "Ready to Ship") {
    return "cyan";
  }

  return "blue";
}
