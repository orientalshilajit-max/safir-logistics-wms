"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import { ClientDocumentsSection } from "./client-documents-section";
import { KeyIcon, MailIcon } from "@/app/components/table-actions";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Tables<"clients">;
type ClientForm = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  telegram: string;
  status: string;
  login_status: Client["login_status"];
  notes: string;
};

const emptyForm: ClientForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  telegram: "",
  status: "pending",
  login_status: "no login",
  notes: "",
};

const inviteCooldownMs = 60_000;

export function ClientFormClient({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [loading, setLoading] = useState(Boolean(clientId));
  const [saving, setSaving] = useState(false);
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string[]>([]);

  const loadClient = useCallback(async () => {
    if (!clientId) return;

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .is("deleted_at", null)
      .single();

    if (loadError) {
      setError(loadError.message);
    } else {
      setClient(data);
      setForm({
        company_name: data.company_name,
        contact_name: data.contact_name,
        email: data.email,
        phone: data.phone ?? "",
        telegram: data.telegram ?? "",
        status: data.status,
        login_status: data.login_status,
        notes: data.notes ?? "",
      });
    }

    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    let active = true;

    async function loadInitialClient() {
      await Promise.resolve();
      if (active) {
        await loadClient();
      }
    }

    void loadInitialClient();

    return () => {
      active = false;
    };
  }, [loadClient]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!form.company_name.trim() || !form.contact_name.trim() || !form.email.trim()) {
      setError("Company, contact, and email are required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      telegram: form.telegram.trim() || null,
      status: form.status.trim() || "pending",
      login_status: form.login_status,
      notes: form.notes.trim() || null,
    };

    const result = clientId
      ? await supabase.from("clients").update(payload).eq("id", clientId)
      : await supabase.from("clients").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    router.push("/clients");
    router.refresh();
  }

  async function createLoginAccess(action: "create" | "resend") {
    if (!client || creatingAccess) return;

    const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
    if (remaining > 0) {
      setMessage(`Please wait ${remaining} seconds before sending another invite.`);
      return;
    }

    setCreatingAccess(true);
    setCooldownUntil(Date.now() + inviteCooldownMs);
    setError(null);
    setMessage(null);
    setInstructions([]);

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
      setInstructions(body.instructions ?? manualOnboardingInstructions(client));
    } else {
      setMessage(body.rate_limited ? "Email rate limit reached" : body.message ?? "Invite sent");
      await loadClient();
    }

    setCreatingAccess(false);
  }

  async function sendPasswordReset() {
    if (!client || resettingPassword) return;

    setResettingPassword(true);
    setError(null);
    setMessage(null);
    setInstructions([]);

    const response = await fetch(`/api/clients/${client.id}/password-reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
    });
    const body = (await response.json()) as {
      message?: string;
      detail?: string;
      error?: string;
      rate_limited?: boolean;
    };

    if (!response.ok) {
      setError(body.error ?? "Unable to send password reset email.");
    } else {
      setMessage(
        body.rate_limited
          ? "Email rate limit reached"
          : body.message ?? "Password reset email sent.",
      );
    }

    setResettingPassword(false);
  }

  if (loading) {
    return <LoadingState label="Loading client..." />;
  }

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          href="/clients"
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to clients
        </Link>
      </div>

      <ErrorBanner message={error} />
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </div>
      ) : null}

      <Panel title={clientId ? "Edit client" : "Add client"}>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void saveClient(event)}>
          <Field label="Company name">
            <input className={inputClassName} required value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} />
          </Field>
          <Field label="Contact name">
            <input className={inputClassName} required value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
          </Field>
          <Field label="Email">
            <input className={inputClassName} required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputClassName} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Telegram">
            <input className={inputClassName} value={form.telegram} onChange={(event) => setForm({ ...form, telegram: event.target.value })} />
          </Field>
          <Field label="Status">
            <select className={inputClassName} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Login status">
            <select className={inputClassName} value={form.login_status} onChange={(event) => setForm({ ...form, login_status: event.target.value as Client["login_status"] })}>
              <option value="no login">no login</option>
              <option value="invited">invited</option>
              <option value="active">active</option>
            </select>
          </Field>
          <div className="lg:col-span-2">
            <Field label="Notes">
              <textarea className={textAreaClassName} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save client"}
            </Button>
            <Link
              href="/clients"
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>

      {client ? (
        <Panel title="Client portal access">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Send a registration invite or help an active client reset their password.
            </p>
            <div className="flex flex-wrap gap-2">
              {client.login_status === "no login" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={creatingAccess || cooldownSeconds > 0}
                  onClick={() => void createLoginAccess("create")}
                >
                  {creatingAccess || cooldownSeconds > 0 ? null : <MailIcon />}
                  {creatingAccess ? "Sending..." : cooldownSeconds > 0 ? `${cooldownSeconds}s` : "Send Registration Invite"}
                </Button>
              ) : null}
              {client.login_status === "invited" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={creatingAccess || cooldownSeconds > 0}
                  onClick={() => void createLoginAccess("resend")}
                >
                  {creatingAccess || cooldownSeconds > 0 ? null : <MailIcon />}
                  {creatingAccess ? "Sending..." : cooldownSeconds > 0 ? `${cooldownSeconds}s` : "Resend Invite"}
                </Button>
              ) : null}
              {client.login_status === "active" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={resettingPassword}
                  onClick={() => void sendPasswordReset()}
                >
                  {resettingPassword ? null : <KeyIcon />}
                  {resettingPassword ? "Sending..." : "Reset Password"}
                </Button>
              ) : null}
            </div>
          </div>
          {instructions.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">
                Manual Supabase Auth setup required
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-amber-800">
                {instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </Panel>
      ) : null}
      {client ? <ClientDocumentsSection clientId={client.id} /> : null}
    </div>
  );
}

function manualOnboardingInstructions(client: Client) {
  return [
    "Add SUPABASE_SERVICE_ROLE_KEY to the server environment to enable automatic invite emails.",
    `Create or invite ${client.email} in Supabase Auth.`,
    `Set app_metadata.role to client and app_metadata.client_id to ${client.id}.`,
    "Return to this screen and mark login status as invited or active.",
  ];
}
