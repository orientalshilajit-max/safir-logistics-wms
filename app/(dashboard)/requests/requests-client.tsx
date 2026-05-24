"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
      .select("*, clients(id, company_name)")
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
      const matchesQuery =
        !normalized ||
        request.request_number.toLowerCase().includes(normalized) ||
        request.clients?.company_name.toLowerCase().includes(normalized) ||
        getRequestServiceType(request.notes).toLowerCase().includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [query, requests, statusFilter]);

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
