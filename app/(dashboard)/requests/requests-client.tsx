"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
  QuickFilterButton,
  StatusBadge,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type ServiceRequest = Tables<"service_requests"> & {
  clients: Client | null;
  request_items?: {
    requested_quantity: number;
    products: Pick<Tables<"products">, "product_name" | "sku"> | null;
  }[];
};

const requestStatuses: ServiceRequest["status"][] = [
  "Draft",
  "Submitted",
  "Approved",
  "In Progress",
  "Waiting Labels",
  "Ready to Ship",
  "Shipped",
  "Completed",
  "Issue / On Hold",
  "Cancelled",
];

export function RequestsClient() {
  const { clientId, role } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isClientPortal = role === "client";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const queryBuilder = supabase
      .from("service_requests")
      .select("*, clients(id, company_name), request_items(requested_quantity, products(product_name, sku))")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      queryBuilder.eq("client_id", clientId);
    }

    const { data, error: requestsError } = await queryBuilder;

    if (requestsError) {
      setError(requestsError.message);
      setRequests([]);
    } else {
      setRequests((data ?? []) as ServiceRequest[]);
    }

    setLoading(false);
  }, [clientId, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus =
        statusFilter === "all" || normalizeRequestStatus(request.status) === statusFilter;
      const serviceType = getRequestServiceType(request.notes);
      const matchesServiceType = serviceTypeFilter === "all" || serviceType === serviceTypeFilter;
      const matchesQuery =
        !normalized ||
        request.request_number.toLowerCase().includes(normalized) ||
        request.clients?.company_name.toLowerCase().includes(normalized) ||
        getRequestServiceType(request.notes).toLowerCase().includes(normalized) ||
        (request.request_items ?? []).some((item) => {
          const product = item.products;
          return (
            product?.product_name.toLowerCase().includes(normalized) ||
            product?.sku?.toLowerCase().includes(normalized)
          );
        });

      return matchesStatus && matchesServiceType && matchesQuery;
    });
  }, [query, requests, serviceTypeFilter, statusFilter]);

  async function updateRequestStatus(
    request: ServiceRequest,
    status: ServiceRequest["status"],
  ) {
    if (updatingStatusId) return;

    const destructive = ["Cancelled", "Completed", "Issue / On Hold"].includes(status);
    if (destructive && !window.confirm(`Move ${request.request_number} to ${status}?`)) {
      return;
    }

    setError(null);
    setUpdatingStatusId(request.id);

    const previousRequests = requests;
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? { ...item, status } : item)),
    );

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        status,
        approved_at: status === "Approved" ? now : request.approved_at,
        rejected_at: status === "Rejected" ? now : request.rejected_at,
      })
      .eq("id", request.id);

    if (updateError) {
      setRequests(previousRequests);
      setError(updateError.message);
    } else {
      await loadData();
    }

    setUpdatingStatusId(null);
  }

  async function archiveRequest(request: ServiceRequest) {
    if (!window.confirm(`Archive ${request.request_number}?`)) {
      return;
    }

    setUpdatingStatusId(request.id);
    setError(null);

    const { error: archiveError } = await supabase
      .from("service_requests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", request.id);

    if (archiveError) {
      setError(archiveError.message);
    } else {
      setRequests((current) => current.filter((item) => item.id !== request.id));
    }

    setUpdatingStatusId(null);
  }

  async function submitDraftRequest(request: ServiceRequest) {
    if (updatingStatusId) return;

    setUpdatingStatusId(request.id);
    setError(null);

    const previousRequests = requests;
    setRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, status: "Pending Approval" } : item,
      ),
    );

    const { error: submitError } = await supabase.rpc("submit_service_request", {
      p_request_id: request.id,
    });

    if (submitError) {
      setRequests(previousRequests);
      setError(submitError.message);
    } else {
      await loadData();
    }

    setUpdatingStatusId(null);
  }

  if (isClientPortal) {
    const orderStats = requests.reduce(
      (totals, request) => {
        totals.total += 1;
        const normalized = normalizeRequestStatus(request.status);
        if (normalized === "Submitted") totals.pending += 1;
        if (normalized === "In Progress" || normalized === "Approved" || normalized === "Ready to Ship") totals.inProgress += 1;
        if (normalized === "Completed") totals.completed += 1;
        if (request.status === "Shipped" || request.status === "Completed") totals.invoiced += 1;
        return totals;
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0, invoiced: 0 },
    );

    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Order Service</h2>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            href="/requests/new"
          >
            <span className="mr-2 text-base leading-none">+</span>
            New Service Request
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <OrderMetric label="Total Orders" value={orderStats.total} sublabel="All time" />
          <OrderMetric label="Pending Approval" value={orderStats.pending} sublabel="Orders" />
          <OrderMetric label="In Progress" value={orderStats.inProgress} sublabel="Orders" />
          <OrderMetric label="Completed" value={orderStats.completed} sublabel="Orders" />
          <OrderMetric label="Invoiced" value={orderStats.invoiced} sublabel="Orders" />
        </section>

        <Panel title="Order Service">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <input
              className={inputClassName}
              placeholder="Search by order ID, product, SKU, service type"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {requestStatuses.map((status) => (
                <option key={status} value={status}>
                  {normalizeRequestStatus(status)}
                </option>
              ))}
            </select>
            <select
              className={inputClassName}
              value={serviceTypeFilter}
              onChange={(event) => setServiceTypeFilter(event.target.value)}
            >
              <option value="all">All service types</option>
              {Array.from(new Set(requests.map((request) => getRequestServiceType(request.notes)).filter((value) => value !== "-"))).map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {serviceType}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading orders..." />
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              title="No service orders found"
              body="Create a service request when you have available inventory ready for work."
              action={
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                  href="/requests/new"
                >
                  + New Service Request
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full min-w-[1080px] text-left text-sm tabular-nums">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Order ID</th>
                      <th className="px-4 py-3 font-semibold">Created Date</th>
                      <th className="px-4 py-3 font-semibold">Service Type</th>
                      <th className="px-4 py-3 font-semibold">Product / SKU</th>
                      <th className="px-4 py-3 font-semibold">Quantity</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Requested By</th>
                      <th className="px-4 py-3 font-semibold">Target Date</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((request) => {
                      const selected = selectedRequestId === request.id || (!selectedRequestId && filteredRequests[0]?.id === request.id);

                      return (
                        <Fragment key={request.id}>
                          <tr
                            className={selected ? "bg-blue-50/60" : "cursor-pointer hover:bg-slate-50"}
                            onClick={() => setSelectedRequestId(request.id)}
                          >
                            <td className="px-3 py-2.5 font-medium text-blue-700">{request.request_number}</td>
                            <td className="px-3 py-2.5 text-slate-600">{formatDate(request.created_at)}</td>
                            <td className="px-3 py-2.5 text-slate-600">{getRequestServiceType(request.notes)}</td>
                            <td className="px-3 py-2.5 text-slate-600">{formatRequestProduct(request)}</td>
                            <td className="px-3 py-2.5 text-slate-600">{request.request_items?.reduce((sum, item) => sum + item.requested_quantity, 0) ?? "-"}</td>
                            <td className="px-3 py-2.5">
                              <StatusBadge tone={statusTone(request.status)}>{normalizeRequestStatus(request.status)}</StatusBadge>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">You</td>
                            <td className="px-3 py-2.5 text-slate-600">-</td>
                            <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                              <RequestActions
                                isAdmin={false}
                                request={request}
                                disabled={updatingStatusId === request.id}
                                onArchive={() => void archiveRequest(request)}
                                onSubmitDraft={() => void submitDraftRequest(request)}
                                onStatus={(status) => void updateRequestStatus(request, status)}
                              />
                            </td>
                          </tr>
                          {selected ? (
                            <tr className="bg-slate-50/70">
                              <td colSpan={9} className="px-3 py-3">
                                <ClientOrderDetails request={request} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge tone="blue">{requests.length} requests</StatusBadge>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          href="/requests/new"
        >
          + Add Request
        </Link>
      </div>

      <Panel title={isClientPortal ? "My requests" : "Requests"}>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "Submitted", "Approved", "In Progress", "Ready to Ship", "Completed"] as const).map(
            (status) => (
              <QuickFilterButton
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All" : status}
              </QuickFilterButton>
            ),
          )}
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <input
            className={inputClassName}
            placeholder="Search request, client, or service"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className={inputClassName}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {requestStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingState label="Loading requests..." />
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            title={isClientPortal ? "No requests yet" : "No service requests found"}
            body={
              isClientPortal
                ? "Create a request when you have available inventory ready for work."
                : "Create a request on behalf of a client when inventory is ready."
            }
            action={
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                href="/requests/new"
              >
                + Add Request
              </Link>
            }
          />
        ) : (
          <div className="max-h-[42rem] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client Name</th>
                  <th className="px-4 py-3 font-semibold">Request #</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">
                      {request.clients?.company_name ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {request.request_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRequestServiceType(request.notes)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(request.status)}>{normalizeRequestStatus(request.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <RequestActions
                        isAdmin={isAdmin}
                        request={request}
                        disabled={updatingStatusId === request.id}
                        onArchive={() => void archiveRequest(request)}
                        onSubmitDraft={() => void submitDraftRequest(request)}
                        onStatus={(status) => void updateRequestStatus(request, status)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RequestActions({
  isAdmin,
  request,
  disabled,
  onStatus,
  onSubmitDraft,
  onArchive,
}: {
  isAdmin: boolean;
  request: ServiceRequest;
  disabled: boolean;
  onStatus: (status: ServiceRequest["status"]) => void;
  onSubmitDraft: () => void;
  onArchive: () => void;
}) {
  const viewLink = (
    <Link
      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      href={`/requests/${request.id}`}
    >
      View
    </Link>
  );
  const editLink = (
    <Link
      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      href={`/requests/${request.id}/edit`}
    >
      Edit
    </Link>
  );

  const button = (label: string, status: ServiceRequest["status"], variant?: "secondary" | "danger") => (
    <Button
      key={`${request.id}-${status}-${label}`}
      type="button"
      variant={variant ?? "secondary"}
      disabled={disabled}
      onClick={() => onStatus(status)}
      className="h-9 px-3"
    >
      {label}
    </Button>
  );

  let actions: ReactNode[] = [viewLink];

  if (request.status === "Draft") {
    actions = [
      editLink,
      <Button
        key="submit-draft"
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={onSubmitDraft}
        className="h-9 px-3"
      >
        Submit
      </Button>,
      archiveButton(disabled, onArchive),
    ];
  } else if (request.status === "Submitted" || request.status === "Pending Approval") {
    actions = isAdmin
      ? [
          button("Approve", "Approved"),
          button("Decline", "Cancelled", "danger"),
          button("Request changes", "Issue / On Hold"),
          editLink,
        ]
      : [viewLink, editLink];
  } else if (request.status === "Approved") {
    actions = isAdmin
      ? [editLink, button("Start processing", "In Progress"), button("Cancel", "Cancelled", "danger")]
      : [viewLink];
  } else if (normalizeRequestStatus(request.status) === "In Progress") {
    actions = isAdmin
      ? [editLink, button("Ready to ship", "Ready to Ship"), button("Issue / On hold", "Issue / On Hold")]
      : [viewLink];
  } else if (request.status === "Ready to Ship") {
    actions = isAdmin ? [editLink, button("Mark shipped", "Shipped"), button("Issue / On hold", "Issue / On Hold")] : [viewLink];
  } else if (request.status === "Shipped") {
    actions = isAdmin ? [viewLink, button("Complete", "Completed")] : [viewLink];
  } else if (request.status === "Completed") {
    actions = isAdmin ? [viewLink, editLink] : [viewLink];
  } else if (normalizeRequestStatus(request.status) === "Cancelled") {
    actions = isAdmin ? [viewLink, button("Reopen", "Submitted")] : [viewLink];
  } else if (normalizeRequestStatus(request.status) === "Issue / On Hold") {
    actions = isAdmin
      ? [editLink, button("Resume", "In Progress"), button("Cancel", "Cancelled", "danger")]
      : [viewLink];
  } else if (request.status === "Need Client Action") {
    actions = [editLink, ...(isAdmin ? [button("Reopen", "Submitted")] : [])];
  }

  return <div className="flex flex-wrap gap-2">{actions}</div>;
}

function OrderMetric({
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

function ClientOrderDetails({ request }: { request: ServiceRequest }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Order {request.request_number}</p>
          <p className="text-xs text-slate-500">{getRequestServiceType(request.notes)}</p>
        </div>
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href={`/requests/${request.id}`}
        >
          View Full Details
        </Link>
      </div>
      <div className="border-b border-slate-200 px-4 pt-3">
        <div className="flex gap-4 text-sm font-semibold text-slate-600">
          <span className="border-b-2 border-blue-600 pb-3 text-blue-700">Items</span>
          <span className="pb-3">Files</span>
          <span className="pb-3">Notes</span>
          <span className="pb-3">History</span>
        </div>
      </div>
      <div className="overflow-auto p-4">
        <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 py-3 font-semibold">SKU</th>
              <th className="px-3 py-3 font-semibold">Quantity</th>
              <th className="px-3 py-3 font-semibold">Service Details</th>
              <th className="px-3 py-3 font-semibold">Packaging</th>
              <th className="px-3 py-3 font-semibold">Special Instructions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(request.request_items ?? []).map((item, index) => (
              <tr key={`${request.id}-${index}`}>
                <td className="px-3 py-3 font-medium text-slate-950">{item.products?.product_name ?? "Unknown product"}</td>
                <td className="px-3 py-3 text-slate-600">{item.products?.sku ?? "-"}</td>
                <td className="px-3 py-3 text-slate-600">{item.requested_quantity}</td>
                <td className="px-3 py-3 text-slate-600">{getRequestServiceType(request.notes)}</td>
                <td className="px-3 py-3 text-slate-600">{request.box_count ? `${request.box_count} boxes` : "-"}</td>
                <td className="px-3 py-3 text-slate-600">{request.notes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatRequestProduct(request: ServiceRequest) {
  const items = request.request_items ?? [];
  const firstItem = items[0];

  if (!firstItem) return "-";
  if (items.length > 1) return "Multiple Products";

  return `${firstItem.products?.product_name ?? "Unknown product"}${firstItem.products?.sku ? ` (${firstItem.products.sku})` : ""}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function archiveButton(disabled: boolean, onArchive: () => void) {
  return (
    <Button
      key="archive"
      type="button"
      variant="danger"
      disabled={disabled}
      onClick={onArchive}
      className="h-9 px-3"
    >
      Archive
    </Button>
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
