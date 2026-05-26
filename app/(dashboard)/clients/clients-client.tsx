"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  StatusBadge,
} from "@/app/components/wms-ui";

type Client = Tables<"clients">;

const inviteCooldownMs = 60_000;

export function ClientsClient() {
  const { session } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [creatingAccessId, setCreatingAccessId] = useState<string | null>(null);
  const [inviteCooldowns, setInviteCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [onboardingInstructions, setOnboardingInstructions] = useState<string[]>([]);

  const clientStats = useMemo(
    () =>
      clients.reduce(
        (totals, client) => {
          const status = normalizeClientStatus(client.status);
          if (status === "Active") totals.active += 1;
          if (status === "Pending") totals.pending += 1;
          if (status === "Inactive") totals.inactive += 1;
          return totals;
        },
        { active: 0, inactive: 0, pending: 0 },
      ),
    [clients],
  );
  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return clients.filter((client) => {
      const status = normalizeClientStatus(client.status);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesQuery =
        !normalized ||
        client.company_name.toLowerCase().includes(normalized) ||
        client.contact_name.toLowerCase().includes(normalized) ||
        client.email.toLowerCase().includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [clients, query, statusFilter]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("clients")
      .select("*")
      .is("deleted_at", null)
      .order("company_name");

    if (loadError) {
      setError(loadError.message);
    } else {
      setClients(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialClients() {
      await Promise.resolve();
      if (active) {
        await loadClients();
      }
    }

    void loadInitialClients();

    return () => {
      active = false;
    };
  }, [loadClients]);

  async function deleteClient(client: Client) {
    if (!window.confirm(`Delete ${client.company_name}?`)) {
      return;
    }

    setError(null);
    const { error: deleteError } = await supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", client.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await loadClients();
    }
  }

  async function createLoginAccess(client: Client, action: "create" | "resend" = "create") {
    if (creatingAccessId) {
      return;
    }

    const cooldownRemaining = getInviteCooldownSeconds(client.id, inviteCooldowns, now);

    if (cooldownRemaining > 0) {
      setOnboardingMessage(
        `Please wait ${cooldownRemaining} seconds before sending another invite.`,
      );
      return;
    }

    setCreatingAccessId(client.id);
    setInviteCooldowns((current) => ({
      ...current,
      [client.id]: Date.now() + inviteCooldownMs,
    }));
    setError(null);
    setOnboardingMessage(null);
    setOnboardingInstructions([]);

    const response = await fetch(`/api/clients/${client.id}/login-access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json()) as {
      message?: string;
      detail?: string;
      error?: string;
      instructions?: string[];
      rate_limited?: boolean;
    };

    if (!response.ok) {
      setError(body.error ?? "Unable to create login access.");
      setOnboardingInstructions(body.instructions ?? manualOnboardingInstructions(client));
    } else {
      setOnboardingMessage(
        body.rate_limited
          ? "Email rate limit reached"
          : body.message ??
          (action === "resend"
            ? "Invite resent"
            : "Invite sent"),
      );
      await loadClients();
    }

    setCreatingAccessId(null);
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Clients</h2>
          <Link
            href="/clients/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Client
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <AdminMetric label="Active" value={clientStats.active} />
          <AdminMetric label="Pending" value={clientStats.pending} />
          <AdminMetric label="Inactive" value={clientStats.inactive} />
        </section>

        <Panel title="Client records">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
            <input
              className={inputClassName}
              placeholder="Search company, contact, or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          {loading ? (
            <LoadingState label="Loading clients..." />
          ) : filteredClients.length === 0 ? (
            <EmptyState title="No clients yet" body="Create the first client account to start connecting products and shipments." />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Login</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-950">{client.company_name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{client.contact_name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{client.email}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={clientStatusTone(client.status)}>
                          {normalizeClientStatus(client.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={loginStatusTone(client.login_status)}>
                          {client.login_status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <Link
                            href={`/clients/${client.id}/edit`}
                            aria-label={`Edit ${client.company_name}`}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                          >
                            E
                          </Link>
                          {client.login_status === "no login" ? (
                            <InviteButton
                              clientId={client.id}
                              cooldowns={inviteCooldowns}
                              label="Create Login Access"
                              loadingLabel="Creating..."
                              loading={creatingAccessId === client.id}
                              now={now}
                              onClick={() => void createLoginAccess(client)}
                            />
                          ) : (
                            <InviteButton
                              clientId={client.id}
                              cooldowns={inviteCooldowns}
                              label="Resend Invite"
                              loadingLabel="Sending..."
                              loading={creatingAccessId === client.id}
                              now={now}
                              onClick={() => void createLoginAccess(client, "resend")}
                            />
                          )}
                          <Button type="button" variant="danger" className="size-8 px-0" onClick={() => void deleteClient(client)}>
                            D
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {onboardingMessage || onboardingInstructions.length > 0 ? (
        <Panel title="Client onboarding">
          {onboardingMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {onboardingMessage}
            </div>
          ) : null}
          {onboardingInstructions.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">
                Manual Supabase Auth setup required
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-amber-800">
                {onboardingInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
    </div>
  );
}

function InviteButton({
  clientId,
  cooldowns,
  label,
  loadingLabel,
  loading,
  now,
  onClick,
}: {
  clientId: string;
  cooldowns: Record<string, number>;
  label: string;
  loadingLabel: string;
  loading: boolean;
  now: number;
  onClick: () => void;
}) {
  const cooldownSeconds = getInviteCooldownSeconds(clientId, cooldowns, now);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={loading || cooldownSeconds > 0}
      onClick={onClick}
    >
      {loading
        ? loadingLabel
        : cooldownSeconds > 0
          ? `${cooldownSeconds}s`
          : label}
    </Button>
  );
}

function getInviteCooldownSeconds(
  clientId: string,
  cooldowns: Record<string, number>,
  now: number,
) {
  return Math.max(0, Math.ceil(((cooldowns[clientId] ?? 0) - now) / 1000));
}

function loginStatusTone(status: Client["login_status"]) {
  if (status === "active") {
    return "emerald";
  }

  if (status === "invited") {
    return "blue";
  }

  return "slate";
}

function normalizeClientStatus(status: string) {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return "Pending";
}

function clientStatusTone(status: string) {
  const normalized = normalizeClientStatus(status);
  if (normalized === "Active") return "emerald";
  if (normalized === "Pending") return "amber";
  return "slate";
}

function manualOnboardingInstructions(client: Client) {
  return [
    "Add SUPABASE_SERVICE_ROLE_KEY to the server environment to enable automatic invites.",
    `Create or invite an Auth user for ${client.email}.`,
    `Set app_metadata to {"role":"client","client_id":"${client.id}"}.`,
    `Set user_metadata client_id to "${client.id}".`,
    'Update this client record with the Auth user id and set login_status to "invited" or "active".',
  ];
}
