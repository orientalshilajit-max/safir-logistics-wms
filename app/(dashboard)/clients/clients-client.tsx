"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  PageHeader,
  Panel,
  StatusBadge,
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
  notes: string;
};

const emptyForm: ClientForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  telegram: "",
  status: "active",
  notes: "",
};

export function ClientsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [editing, setEditing] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(
    () => clients.filter((client) => client.status === "active").length,
    [clients],
  );

  useEffect(() => {
    void loadClients();
  }, []);

  async function loadClients() {
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
  }

  function startEdit(client: Client) {
    setEditing(client);
    setForm({
      company_name: client.company_name,
      contact_name: client.contact_name,
      email: client.email,
      phone: client.phone ?? "",
      telegram: client.telegram ?? "",
      status: client.status,
      notes: client.notes ?? "",
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      telegram: form.telegram.trim() || null,
      status: form.status.trim() || "active",
      notes: form.notes.trim() || null,
    };

    const result = editing
      ? await supabase.from("clients").update(payload).eq("id", editing.id)
      : await supabase.from("clients").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      resetForm();
      await loadClients();
    }

    setSaving(false);
  }

  async function deleteClient(client: Client) {
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="Create and maintain prep center client accounts used throughout products, shipments, and inventory."
        action={<StatusBadge tone="emerald">{activeCount} active</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Client records" description="Real records from Supabase.">
          {loading ? (
            <p className="text-sm text-slate-500">Loading clients...</p>
          ) : clients.length === 0 ? (
            <EmptyState title="No clients yet" body="Create the first client account to start connecting products and shipments." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">{client.company_name}</td>
                      <td className="px-4 py-3 text-slate-600">{client.contact_name}</td>
                      <td className="px-4 py-3 text-slate-600">{client.email}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={client.status === "active" ? "emerald" : "slate"}>
                          {client.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" onClick={() => startEdit(client)}>
                            Edit
                          </Button>
                          <Button type="button" variant="danger" onClick={() => void deleteClient(client)}>
                            Delete
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

        <Panel title={editing ? "Edit client" : "Create client"}>
          <form className="space-y-4" onSubmit={(event) => void saveClient(event)}>
            <Field label="Company name">
              <input
                className={inputClassName}
                required
                value={form.company_name}
                onChange={(event) => setForm({ ...form, company_name: event.target.value })}
              />
            </Field>
            <Field label="Contact name">
              <input
                className={inputClassName}
                required
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClassName}
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Phone">
                <input
                  className={inputClassName}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
              <Field label="Telegram">
                <input
                  className={inputClassName}
                  value={form.telegram}
                  onChange={(event) => setForm({ ...form, telegram: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Status">
              <select
                className={inputClassName}
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="active">active</option>
                <option value="onboarding">onboarding</option>
                <option value="paused">paused</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                className={textAreaClassName}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create client"}
              </Button>
              {editing ? (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
