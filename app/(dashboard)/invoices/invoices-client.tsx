"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
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
import { formatMoney } from "../services/services-client";
import { ActivityTimeline } from "@/app/components/activity-timeline";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type ServiceRequest = Pick<Tables<"service_requests">, "id" | "request_number">;
type InvoiceItem = Tables<"invoice_items">;
type Invoice = Tables<"invoices"> & {
  clients: Client | null;
  service_requests: ServiceRequest | null;
  invoice_items: InvoiceItem[];
};
type InvoiceStatus = Invoice["status"];
type InvoiceItemType = InvoiceItem["item_type"];

const invoiceStatuses: InvoiceStatus[] = [
  "Draft",
  "Sent",
  "Unpaid",
  "Partial Paid",
  "Paid",
  "Overdue",
  "Cancelled",
];

const customItemTypes: InvoiceItemType[] = [
  "storage_fee",
  "repack_fee",
  "custom_labor",
  "discount",
  "urgent_processing",
];

const customLabels: Record<InvoiceItemType, string> = {
  service: "Service",
  storage_fee: "Storage fee",
  repack_fee: "Repack fee",
  custom_labor: "Custom labor",
  discount: "Discount",
  urgent_processing: "Urgent processing",
};

type LineForm = {
  item_type: InvoiceItemType;
  description: string;
  quantity: string;
  unit_price: string;
};

const emptyLineForm: LineForm = {
  item_type: "storage_fee",
  description: "",
  quantity: "1",
  unit_price: "0.00",
};

export function InvoicesClient() {
  const { role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0];
  const filteredInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
      const matchesQuery =
        !normalized ||
        invoice.invoice_number.toLowerCase().includes(normalized) ||
        invoice.clients?.company_name.toLowerCase().includes(normalized) ||
        invoice.service_requests?.request_number.toLowerCase().includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [invoices, query, statusFilter]);

  const loadInvoices = useCallback(async () => {
    setError(null);
    await supabase.rpc("mark_overdue_invoices");
    const { data, error: loadError } = await supabase
      .from("invoices")
      .select(
        "*, clients(id, company_name), service_requests(id, request_number), invoice_items(*)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      const loaded = (data ?? []) as Invoice[];
      setInvoices(loaded);
      setSelectedInvoiceId((current) => current ?? loaded[0]?.id ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInvoices(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadInvoices]);

  async function updateInvoiceStatus(invoice: Invoice, status: InvoiceStatus) {
    setError(null);
    const paidAmount =
      status === "Paid" ? invoice.total_amount : status === "Partial Paid" ? invoice.paid_amount : invoice.paid_amount;
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status, paid_amount: paidAmount })
      .eq("id", invoice.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await supabase.rpc("recalculate_invoice_totals", { p_invoice_id: invoice.id });
      await loadInvoices();
    }
  }

  async function applyPayment(invoice: Invoice, mode: "paid" | "partial") {
    setError(null);
    const amount =
      mode === "paid"
        ? invoice.total_amount
        : Math.min(Number(paymentAmount) || 0, invoice.total_amount);

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        paid_amount: amount,
        status: amount >= invoice.total_amount ? "Paid" : "Partial Paid",
      })
      .eq("id", invoice.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await supabase.rpc("recalculate_invoice_totals", { p_invoice_id: invoice.id });
      setPaymentAmount("");
      await loadInvoices();
    }
  }

  async function saveInvoiceItem(item: InvoiceItem) {
    setError(null);
    const { error: updateError } = await supabase
      .from("invoice_items")
      .update({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        item_type: item.item_type,
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadInvoices();
    }
  }

  async function addLineItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInvoice) {
      return;
    }

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("invoice_items").insert({
      invoice_id: selectedInvoice.id,
      service_request_id: selectedInvoice.service_request_id,
      item_type: lineForm.item_type,
      description: lineForm.description.trim() || customLabels[lineForm.item_type],
      quantity: Number(lineForm.quantity) || 1,
      unit_price: Number(lineForm.unit_price) || 0,
      sort_order: selectedInvoice.invoice_items.length + 1,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setLineForm(emptyLineForm);
      await loadInvoices();
    }

    setSaving(false);
  }

  function updateLocalItem(invoiceId: string, itemId: string, patch: Partial<InvoiceItem>) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId
          ? {
              ...invoice,
              invoice_items: invoice.invoice_items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : invoice,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Generated from completed service requests. Payments are tracked manually."
        action={<StatusBadge tone="blue">{invoices.length} invoices</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_34rem]">
        <Panel title="Invoice list" description="One invoice is generated when a service request is completed.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <input
              className={inputClassName}
              placeholder="Search invoice, client, or request"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {invoiceStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading invoices...</p>
          ) : filteredInvoices.length === 0 ? (
            <EmptyState title="No invoices found" body="Complete a service request to generate an invoice." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{invoice.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600">{invoice.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{invoice.service_requests?.request_number ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{invoice.due_date}</td>
                      <td className="px-4 py-3 font-medium text-slate-950">{formatMoney(invoice.total_amount)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMoney(invoice.balance_due)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Invoice detail" description={selectedInvoice ? selectedInvoice.invoice_number : "Select an invoice"}>
          {!selectedInvoice ? (
            <EmptyState title="No invoice selected" body="Choose an invoice from the list." />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Summary label="Subtotal" value={formatMoney(selectedInvoice.subtotal)} />
                <Summary label="Discounts" value={formatMoney(selectedInvoice.discount_total)} />
                <Summary label="Total" value={formatMoney(selectedInvoice.total_amount)} />
                <Summary label="Paid" value={formatMoney(selectedInvoice.paid_amount)} />
              </div>

              <div className="flex flex-wrap gap-2">
                {invoiceStatuses.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    variant={status === "Cancelled" ? "danger" : "secondary"}
                    disabled={!isAdmin || selectedInvoice.status === status}
                    onClick={() => void updateInvoiceStatus(selectedInvoice, status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input
                  className={inputClassName}
                  min="0"
                  step="0.01"
                  type="number"
                  placeholder="Partial payment amount"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
                <Button type="button" variant="secondary" disabled={!isAdmin} onClick={() => void applyPayment(selectedInvoice, "partial")}>
                  Mark partial
                </Button>
                <Button type="button" disabled={!isAdmin} onClick={() => void applyPayment(selectedInvoice, "paid")}>
                  Mark paid
                </Button>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-950">Line items</p>
                {selectedInvoice.invoice_items
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem_auto]">
                        <input
                          className={inputClassName}
                          disabled={!isAdmin}
                          value={item.description}
                          onChange={(event) =>
                            updateLocalItem(selectedInvoice.id, item.id, {
                              description: event.target.value,
                            })
                          }
                        />
                        <input
                          className={inputClassName}
                          disabled={!isAdmin}
                          min="0"
                          step="0.01"
                          type="number"
                          value={item.quantity}
                          onChange={(event) =>
                            updateLocalItem(selectedInvoice.id, item.id, {
                              quantity: Number(event.target.value) || 0,
                            })
                          }
                        />
                        <input
                          className={inputClassName}
                          disabled={!isAdmin}
                          step="0.01"
                          type="number"
                          value={item.unit_price}
                          onChange={(event) =>
                            updateLocalItem(selectedInvoice.id, item.id, {
                              unit_price: Number(event.target.value) || 0,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!isAdmin}
                          onClick={() => void saveInvoiceItem(item)}
                        >
                          Save
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{customLabels[item.item_type]}</span>
                        <span className="font-semibold text-slate-700">{formatMoney(item.line_total)}</span>
                      </div>
                    </div>
                  ))}
              </div>

              <form className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" onSubmit={(event) => void addLineItem(event)}>
                <p className="text-sm font-semibold text-slate-950">Add custom line item</p>
                <Field label="Type">
                  <select
                    className={inputClassName}
                    disabled={!isAdmin}
                    value={lineForm.item_type}
                    onChange={(event) =>
                      setLineForm({
                        ...lineForm,
                        item_type: event.target.value as InvoiceItemType,
                        description: customLabels[event.target.value as InvoiceItemType],
                      })
                    }
                  >
                    {customItemTypes.map((type) => (
                      <option key={type} value={type}>
                        {customLabels[type]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description">
                  <textarea
                    className={textAreaClassName}
                    disabled={!isAdmin}
                    value={lineForm.description}
                    onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Quantity">
                    <input
                      className={inputClassName}
                      disabled={!isAdmin}
                      min="0"
                      step="0.01"
                      type="number"
                      value={lineForm.quantity}
                      onChange={(event) => setLineForm({ ...lineForm, quantity: event.target.value })}
                    />
                  </Field>
                  <Field label="Unit price">
                    <input
                      className={inputClassName}
                      disabled={!isAdmin}
                      min="0"
                      step="0.01"
                      type="number"
                      value={lineForm.unit_price}
                      onChange={(event) => setLineForm({ ...lineForm, unit_price: event.target.value })}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={!isAdmin || saving}>
                  {saving ? "Adding..." : "Add line item"}
                </Button>
              </form>
              <ActivityTimeline
                entityType="invoices"
                entityId={selectedInvoice.id}
                title="Invoice activity"
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function invoiceStatusTone(status: InvoiceStatus) {
  if (status === "Paid") return "emerald";
  if (status === "Partial Paid" || status === "Sent" || status === "Unpaid") return "blue";
  if (status === "Overdue") return "amber";
  if (status === "Cancelled") return "rose";
  return "slate";
}
