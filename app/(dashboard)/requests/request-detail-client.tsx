"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ActivityTimeline } from "@/app/components/activity-timeline";
import {
  hasMissingBoxLabels,
  LabelManager,
  type RequestBoxOption,
} from "@/app/components/label-manager";
import { useAuth } from "@/app/auth/auth-provider";
import { CLIENT_ACCOUNT_LINK_ERROR } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  ErrorBanner,
  LoadingState,
  Panel,
  StatusBadge,
} from "@/app/components/wms-ui";
import { formatMoney, formatPricingType } from "../services/service-form-client";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku" | "fnsku">;
type InventoryRow = Pick<Tables<"inventory">, "id" | "available_qty" | "reserved_qty">;
type RequestService = Tables<"request_item_services"> & {
  services: Pick<Tables<"services">, "name" | "pricing_type"> | null;
};
type RequestItem = Tables<"request_items"> & {
  products: Product | null;
  inventory: InventoryRow | null;
  request_item_services: RequestService[];
};
type ShippingLabel = Pick<
  Tables<"shipping_labels">,
  "id" | "label_category" | "request_box_id" | "box_number"
>;
type ServiceRequest = Tables<"service_requests"> & {
  clients: Client | null;
  request_items: RequestItem[];
  request_boxes: RequestBoxOption[];
  shipping_labels: ShippingLabel[];
};

export function RequestDetailClient({ requestId }: { requestId: string }) {
  const { clientId, role } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isClientPortal = role === "client";
  const missingLabels = useMemo(
    () =>
      request
        ? hasMissingBoxLabels(request.request_boxes, request.shipping_labels)
        : false,
    [request],
  );

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isClientPortal && !clientId) {
      setRequest(null);
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setLoading(false);
      return;
    }

    const query = supabase
      .from("service_requests")
      .select("*, clients(id, company_name), request_items(*, products(id, product_name, sku, fnsku), inventory(id, available_qty, reserved_qty), request_item_services(*, services(name, pricing_type))), request_boxes(id, box_number, tracking_number), shipping_labels(id, label_category, request_box_id, box_number)")
      .eq("id", requestId)
      .is("deleted_at", null);

    if (isClientPortal) {
      query.eq("client_id", clientId as string);
    }

    const { data, error: requestError } = await query.single();

    if (requestError || !data) {
      setError(requestError?.message ?? "Unable to load request.");
      setRequest(null);
    } else {
      setRequest(data as ServiceRequest);
    }

    setLoading(false);
  }, [clientId, isClientPortal, requestId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRequest(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRequest]);

  async function updateStatus(status: ServiceRequest["status"]) {
    if (!request || updatingStatus) return;

    if (
      ["Cancelled", "Completed", "Issue / On Hold"].includes(status) &&
      !window.confirm(`Move ${request.request_number} to ${normalizeRequestStatus(status)}?`)
    ) {
      return;
    }

    setUpdatingStatus(true);
    setError(null);

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        status,
        approved_at: status === "Approved" ? now : request.approved_at,
        rejected_at: status === "Cancelled" ? now : request.rejected_at,
      })
      .eq("id", request.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setRequest({ ...request, status });
      await loadRequest();
    }

    setUpdatingStatus(false);
  }

  if (loading) {
    return <LoadingState label="Loading request..." />;
  }

  if (!request) {
    return <ErrorBanner message={error ?? "Request not found."} />;
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(request.status)}>{normalizeRequestStatus(request.status)}</StatusBadge>
          {missingLabels ? <StatusBadge tone="amber">Missing labels</StatusBadge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href="/requests"
          >
            Back
          </Link>
          {(isAdmin || ["Draft", "Submitted", "Need Client Action", "Issue / On Hold"].includes(request.status)) ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              href={`/requests/${request.id}/edit`}
            >
              Edit
            </Link>
          ) : null}
        </div>
      </div>

      <Panel title={request.request_number}>
        <div className="grid gap-4 md:grid-cols-3">
          <Detail label="Client" value={request.clients?.company_name ?? "Unknown"} />
          <Detail label="Service" value={getRequestServiceType(request.notes)} />
          <Detail label="Created by" value={request.created_by ? "Admin/user account" : "System"} />
          <Detail label="Date" value={new Date(request.created_at).toLocaleDateString()} />
          <Detail label="Estimate" value={formatMoney(request.estimated_total)} />
          <Detail label="Boxes" value={String(request.box_count)} />
          <Detail label="Carrier" value={request.carrier ?? "-"} />
          <Detail label="Tracking" value={request.tracking_numbers.join(", ") || "-"} />
          <Detail label="Labels" value={`${request.shipping_labels.length} uploaded`} />
        </div>
      </Panel>

      <Panel title="Products and services">
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">SKU/FNSKU</th>
                <th className="px-4 py-3 font-semibold">Quantity</th>
                <th className="px-4 py-3 font-semibold">Reserved</th>
                <th className="px-4 py-3 font-semibold">Services</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {request.request_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {item.products?.product_name ?? "Unknown product"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.products?.sku ?? "-"} / {item.fnsku ?? item.products?.fnsku ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.requested_quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{item.inventory?.reserved_qty ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="grid gap-1">
                      {item.request_item_services.map((service) => (
                        <span key={service.id}>
                          {service.services?.name ?? "Service"} · {formatMoney(service.estimated_total)} · {formatPricingType(service.pricing_type)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Request notes">
        <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {request.notes || "No notes."}
        </pre>
      </Panel>

      {isAdmin ? (
        <Panel title="Admin actions">
          <div className="flex flex-wrap gap-2">
            {request.status === "Pending Approval" || request.status === "Submitted" ? (
              <>
                <Button disabled={updatingStatus} onClick={() => void updateStatus("Approved")}>
                  Approve
                </Button>
                <Button
                  disabled={updatingStatus}
                  variant="danger"
                  onClick={() => void updateStatus("Cancelled")}
                >
                  Decline
                </Button>
                <Button
                  disabled={updatingStatus}
                  variant="secondary"
                  onClick={() => void updateStatus("Issue / On Hold")}
                >
                  Request changes
                </Button>
              </>
            ) : null}
            {request.status === "Approved" ? (
              <Button disabled={updatingStatus} onClick={() => void updateStatus("In Progress")}>
                Start processing
              </Button>
            ) : null}
            {normalizeRequestStatus(request.status) === "In Progress" ? (
              <Button disabled={updatingStatus} onClick={() => void updateStatus("Ready to Ship")}>
                Mark ready to ship
              </Button>
            ) : null}
            {request.status === "Ready to Ship" ? (
              <Button disabled={updatingStatus} onClick={() => void updateStatus("Shipped")}>
                Mark shipped
              </Button>
            ) : null}
            {request.status === "Shipped" ? (
              <Button disabled={updatingStatus} onClick={() => void updateStatus("Completed")}>
                Complete
              </Button>
            ) : null}
            {normalizeRequestStatus(request.status) === "Issue / On Hold" ? (
              <Button disabled={updatingStatus} onClick={() => void updateStatus("In Progress")}>
                Resume
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <LabelManager
        clientId={request.client_id}
        serviceRequestId={request.id}
        boxes={request.request_boxes}
        title="Request labels"
        onLabelsChange={loadRequest}
        onStatusChange={(status) => setRequest({ ...request, status })}
      />
      <ActivityTimeline
        entityType="service_requests"
        entityId={request.id}
        title="Request activity"
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function getRequestServiceType(notes: string | null) {
  return (
    notes
      ?.split("\n")
      .find((line) => line.startsWith("Request type:"))
      ?.replace("Request type:", "")
      .trim() || "-"
  );
}

function statusTone(status: ServiceRequest["status"]) {
  const normalized = normalizeRequestStatus(status);

  if (normalized === "Approved" || normalized === "Completed" || normalized === "Shipped") {
    return "emerald";
  }

  if (normalized === "Cancelled" || normalized === "Issue / On Hold") {
    return "rose";
  }

  if (normalized === "Submitted" || normalized === "Waiting Labels") {
    return "amber";
  }

  if (normalized === "Ready to Ship") {
    return "cyan";
  }

  return "blue";
}

function normalizeRequestStatus(status: ServiceRequest["status"]) {
  if (status === "Pending Approval") return "Submitted";
  if (
    status === "Prep in Progress" ||
    status === "Ready for Prep" ||
    status === "QC Check" ||
    status === "Packing" ||
    status === "Ready to Pack"
  ) {
    return "In Progress";
  }
  if (status === "On Hold" || status === "Need Client Action") return "Issue / On Hold";
  if (status === "Rejected") return "Cancelled";

  return status;
}
