"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { ChangePasswordForm } from "@/app/components/change-password-form";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import { Button, ErrorBanner, inputClassName, LoadingState, Panel, StatusBadge } from "@/app/components/wms-ui";
import { TableActionButton, TrashIcon } from "@/app/components/table-actions";

type CarrierOption = Tables<"carrier_options">;

const settings = [
  ["Company info", "Business profile, contact details, and prep center identity."],
  ["Invoice defaults", "Due dates, payment instructions, logo, and billing notes."],
  ["Admin users", "Team access and admin role management."],
  ["Notifications", "Operational alerts for requests, shipments, inventory, and invoices."],
  ["File categories", "Document categories for agreements, compliance, invoices, and product files."],
  ["Future integrations", "Carrier, marketplace, accounting, and printing connections."],
];

export function SettingsClient() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <div className="space-y-5">
      <ChangePasswordForm />

      {isAdmin ? (
        <>
          <CarrierOptionsManager />
          <Panel title="Admin Settings">
            <div className="grid gap-3 md:grid-cols-2">
              {settings.map(([title, body]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{title}</p>
                    <StatusBadge>Setup</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function CarrierOptionsManager() {
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [newCarrier, setNewCarrier] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("carrier_options")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");

    if (loadError) {
      setError(loadError.message);
    } else {
      setCarriers(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialCarriers() {
      await Promise.resolve();
      if (active) {
        await loadCarriers();
      }
    }

    void loadInitialCarriers();

    return () => {
      active = false;
    };
  }, [loadCarriers]);

  async function addCarrier() {
    if (saving || !newCarrier.trim()) return;

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("carrier_options").insert({
      active: true,
      name: newCarrier.trim(),
      sort_order: (carriers.at(-1)?.sort_order ?? 0) + 10,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setNewCarrier("");
      await loadCarriers();
    }

    setSaving(false);
  }

  async function removeCarrier(carrier: CarrierOption) {
    if (!window.confirm(`Remove ${carrier.name}?`)) return;

    setError(null);
    const { error: removeError } = await supabase
      .from("carrier_options")
      .update({
        active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", carrier.id);

    if (removeError) {
      setError(removeError.message);
    } else {
      await loadCarriers();
    }
  }

  async function moveCarrier(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    const current = carriers[index];
    const target = carriers[targetIndex];

    if (!current || !target) return;

    setError(null);
    const [currentResult, targetResult] = await Promise.all([
      supabase.from("carrier_options").update({ sort_order: target.sort_order }).eq("id", current.id),
      supabase.from("carrier_options").update({ sort_order: current.sort_order }).eq("id", target.id),
    ]);

    if (currentResult.error || targetResult.error) {
      setError(currentResult.error?.message ?? targetResult.error?.message ?? "Unable to reorder carriers.");
    } else {
      await loadCarriers();
    }
  }

  return (
    <Panel title="Carrier Options">
      <ErrorBanner message={error} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClassName}
          placeholder="Add carrier"
          value={newCarrier}
          onChange={(event) => setNewCarrier(event.target.value)}
        />
        <Button type="button" disabled={saving || !newCarrier.trim()} onClick={() => void addCarrier()}>
          Add Carrier
        </Button>
      </div>
      {loading ? (
        <LoadingState label="Loading carriers..." />
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {carriers.map((carrier, index) => (
            <div key={carrier.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">{carrier.name}</span>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="secondary" className="size-8 px-0" disabled={index === 0} onClick={() => void moveCarrier(index, -1)}>
                  ↑
                </Button>
                <Button type="button" variant="secondary" className="size-8 px-0" disabled={index === carriers.length - 1} onClick={() => void moveCarrier(index, 1)}>
                  ↓
                </Button>
                <TableActionButton
                  aria-label={`Remove ${carrier.name}`}
                  title="Remove Carrier"
                  tone="danger"
                  onClick={() => void removeCarrier(carrier)}
                >
                  <TrashIcon />
                </TableActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
