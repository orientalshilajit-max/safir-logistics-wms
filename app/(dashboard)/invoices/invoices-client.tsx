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
  LoadingState,
  Panel,
  QuickFilterButton,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";
import { formatMoney } from "../services/service-form-client";

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
  const { role, clientId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isClientPortal = role === "client";
  const selectedInvoice = selectedInvoiceId
    ? invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null
    : null;
  const filteredInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
      const matchesDate = dateFilter === "all" || isWithinDateFilter(invoice.issue_date, dateFilter);
      const matchesQuery =
        !normalized ||
        invoice.invoice_number.toLowerCase().includes(normalized) ||
        invoice.clients?.company_name.toLowerCase().includes(normalized) ||
        invoice.service_requests?.request_number.toLowerCase().includes(normalized);

      return matchesStatus && matchesQuery && matchesDate;
    });
  }, [dateFilter, invoices, query, statusFilter]);

  const loadInvoices = useCallback(async () => {
    setError(null);
    if (isAdmin) {
      const { error: overdueError } = await supabase.rpc("mark_overdue_invoices");
      if (overdueError) {
        setError(overdueError.message);
      }
    }
    const invoicesQuery = supabase
      .from("invoices")
      .select(
        "*, clients(id, company_name), service_requests(id, request_number), invoice_items(*)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (isClientPortal && clientId) {
      invoicesQuery.eq("client_id", clientId);
    }

    const { data, error: loadError } = await invoicesQuery;

    if (loadError) {
      setError(loadError.message);
    } else {
      const loaded = (data ?? []) as Invoice[];
      setInvoices(loaded);
      setSelectedInvoiceId((current) =>
        current && loaded.some((invoice) => invoice.id === current) ? current : null,
      );
    }

    setLoading(false);
  }, [clientId, isAdmin, isClientPortal]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInvoices(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadInvoices]);

  async function updateInvoiceStatus(invoice: Invoice, status: InvoiceStatus) {
    if (actionSaving) {
      return;
    }

    if (
      (status === "Cancelled" || status === "Paid") &&
      !window.confirm(`Mark ${invoice.invoice_number} as ${status}?`)
    ) {
      return;
    }

    setError(null);
    setActionSaving(`status-${invoice.id}`);
    const previousInvoices = invoices;
    setInvoices((current) =>
      current.map((item) => (item.id === invoice.id ? { ...item, status } : item)),
    );
    const paidAmount =
      status === "Paid" ? invoice.total_amount : status === "Partial Paid" ? invoice.paid_amount : invoice.paid_amount;
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status, paid_amount: paidAmount })
      .eq("id", invoice.id);

    if (updateError) {
      setInvoices(previousInvoices);
      setError(updateError.message);
    } else {
      await supabase.rpc("recalculate_invoice_totals", { p_invoice_id: invoice.id });
      await loadInvoices();
    }
    setActionSaving(null);
  }

  async function applyPayment(invoice: Invoice, mode: "paid" | "partial") {
    if (actionSaving) {
      return;
    }

    setError(null);
    const amount =
      mode === "paid"
        ? invoice.total_amount
        : Math.min(Number(paymentAmount) || 0, invoice.total_amount);

    if (mode === "partial" && (!Number.isFinite(amount) || amount <= 0)) {
      setError("Enter a partial payment amount greater than 0.");
      return;
    }

    if (!window.confirm(`Record ${formatMoney(amount)} payment for ${invoice.invoice_number}?`)) {
      return;
    }

    setActionSaving(`payment-${invoice.id}`);

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
    setActionSaving(null);
  }

  async function saveInvoiceItem(item: InvoiceItem) {
    if (actionSaving) {
      return;
    }

    if (!item.description.trim()) {
      setError("Invoice line description is required.");
      return;
    }

    if (item.quantity < 0 || item.unit_price < 0) {
      setError("Invoice line quantity and unit price must be zero or greater.");
      return;
    }

    setError(null);
    setActionSaving(`line-${item.id}`);
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
    setActionSaving(null);
  }

  async function addLineItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInvoice || saving) {
      return;
    }

    const quantity = Number(lineForm.quantity);
    const unitPrice = Number(lineForm.unit_price);

    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Line quantity and unit price must be zero or greater.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("invoice_items").insert({
      invoice_id: selectedInvoice.id,
      service_request_id: selectedInvoice.service_request_id,
      item_type: lineForm.item_type,
      description: lineForm.description.trim() || customLabels[lineForm.item_type],
      quantity,
      unit_price: unitPrice,
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

  if (isClientPortal) {
    const totalInvoices = invoices.length;
    const unpaidTotal = invoices
      .filter((invoice) => ["Sent", "Unpaid", "Partial Paid"].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
    const overdueTotal = invoices
      .filter((invoice) => invoice.status === "Overdue")
      .reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0);
    const paidTotal = invoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce((sum, invoice) => sum + Number(invoice.paid_amount ?? invoice.total_amount ?? 0), 0);

    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Invoices</h2>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <InvoiceMetric label="Total Invoices" value={String(totalInvoices)} sublabel="All time" />
          <InvoiceMetric label="Unpaid" value={formatMoney(unpaidTotal)} sublabel="Open balance" />
          <InvoiceMetric label="Overdue" value={formatMoney(overdueTotal)} sublabel="Past due" />
          <InvoiceMetric label="Paid" value={formatMoney(paidTotal)} sublabel="Paid invoices" />
          <InvoiceMetric label="Credits" value={formatMoney(0)} sublabel="Available credit" />
        </section>

        <Panel title="Invoices">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <input
              className={inputClassName}
              placeholder="Search by invoice number, type, status"
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
            <select
              className={inputClassName}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["all", "All Invoices"],
              ["Unpaid", "Unpaid"],
              ["Overdue", "Overdue"],
              ["Paid", "Paid"],
              ["Cancelled", "Voided / Cancelled"],
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

          {loading ? (
            <LoadingState label="Loading invoices..." />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState title="No invoices found" body="Invoices will appear here after services are billed." />
          ) : (
            <div className="max-h-[42rem] overflow-auto">
              <table className="w-full min-w-[1080px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice #</th>
                    <th className="px-4 py-3 font-semibold">Invoice Date</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Related To</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-blue-700">{invoice.invoice_number}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(invoice.issue_date)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(invoice.due_date)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatInvoiceType(invoice)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{invoice.service_requests?.request_number ?? "-"}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-950">{formatMoney(invoice.total_amount)}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</StatusBadge>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-950">{formatMoney(invoice.balance_due)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            aria-label={`View ${invoice.invoice_number}`}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                            onClick={() => openInvoicePrintView(invoice)}
                          >
                            V
                          </button>
                          <button
                            type="button"
                            aria-label={`Download ${invoice.invoice_number}`}
                            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                            onClick={() => openInvoicePrintView(invoice)}
                          >
                            D
                          </button>
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
    );
  }

  const adminInvoiceStats = {
    overdue: invoices
      .filter((invoice) => invoice.status === "Overdue")
      .reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0),
    paid: invoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce((sum, invoice) => sum + Number(invoice.paid_amount ?? invoice.total_amount ?? 0), 0),
    total: invoices.length,
    unpaid: invoices
      .filter((invoice) => ["Sent", "Unpaid", "Partial Paid"].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0),
  };

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Invoices</h2>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <InvoiceMetric label="Total Invoices" value={String(adminInvoiceStats.total)} sublabel="All clients" />
          <InvoiceMetric label="Open" value={formatMoney(adminInvoiceStats.unpaid)} sublabel="Outstanding" />
          <InvoiceMetric label="Overdue" value={formatMoney(adminInvoiceStats.overdue)} sublabel="Past due" />
          <InvoiceMetric label="Paid" value={formatMoney(adminInvoiceStats.paid)} sublabel="Paid revenue" />
        </section>

        <Panel
          title={isClientPortal ? "My invoices" : "Invoices"}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "Draft", "Unpaid", "Partial Paid", "Paid", "Overdue"] as const).map(
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
            <LoadingState label="Loading invoices..." />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              title={isClientPortal ? "No invoices yet" : "No invoices found"}
              body={
                isClientPortal
                  ? "Invoices will appear here after completed service requests are billed."
                  : "Complete a service request to generate an invoice."
              }
            />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[920px] text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice #</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">{invoice.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600">{invoice.clients?.company_name ?? "Unknown"}</td>
                      <td className="px-4 py-3 font-medium text-slate-950">{formatMoney(invoice.total_amount)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{invoice.due_date}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" onClick={() => openInvoicePrintView(invoice)}>
                            View
                          </Button>
                          {isAdmin ? (
                            <Button type="button" variant="secondary" onClick={() => setSelectedInvoiceId(invoice.id)}>
                              Edit
                            </Button>
                          ) : null}
                          <Button type="button" variant="secondary" onClick={() => openInvoicePrintView(invoice)}>
                            Download PDF
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

        {selectedInvoice ? (
          <Panel title={`Edit ${selectedInvoice.invoice_number}`}>
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
                    disabled={!isAdmin || selectedInvoice.status === status || actionSaving !== null}
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
                <Button type="button" variant="secondary" disabled={!isAdmin || actionSaving !== null} onClick={() => void applyPayment(selectedInvoice, "partial")}>
                  Mark partial
                </Button>
                <Button type="button" disabled={!isAdmin || actionSaving !== null} onClick={() => void applyPayment(selectedInvoice, "paid")}>
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
                          disabled={!isAdmin || actionSaving === `line-${item.id}`}
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
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={() => setSelectedInvoiceId(null)}>
                  Close editor
                </Button>
              </div>
            </div>
          </Panel>
        ) : null}
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

function InvoiceMetric({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

function formatInvoiceType(invoice: Invoice) {
  const firstType = invoice.invoice_items[0]?.item_type;

  if (!firstType) return "Services";

  return customLabels[firstType] ?? firstType.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isWithinDateFilter(value: string, filter: string) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);

  if (filter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    return true;
  }

  return date >= start && date <= now;
}

function invoiceStatusTone(status: InvoiceStatus) {
  if (status === "Paid") return "emerald";
  if (status === "Partial Paid" || status === "Sent" || status === "Unpaid") return "blue";
  if (status === "Overdue") return "amber";
  if (status === "Cancelled") return "rose";
  return "slate";
}

function openInvoicePrintView(invoice: Invoice) {
  const lineItems = invoice.invoice_items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.unit_price)}</td>
          <td>${formatMoney(item.line_total)}</td>
        </tr>
      `,
    )
    .join("");
  const printWindow = window.open("", "_blank", "width=900,height=1100");

  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(invoice.invoice_number)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #0f172a; }
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
          img { max-width: 180px; height: auto; }
          table { width: 100%; border-collapse: collapse; margin-top: 32px; font-size: 13px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          th { color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: .08em; }
          .totals { margin-top: 28px; margin-left: auto; width: 280px; }
          .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e2e8f0; }
          .note { margin-top: 32px; color: #475569; font-size: 13px; }
          @media print { button { display: none; } body { margin: 24px; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print / Save PDF</button>
        <header>
          <div>
            <img src="/logosaflog.png" alt="Safir Logistics" />
            <p>Safir Logistics</p>
          </div>
          <div>
            <h1>Invoice ${escapeHtml(invoice.invoice_number)}</h1>
            <p>Client: ${escapeHtml(invoice.clients?.company_name ?? "Unknown")}</p>
            <p>Due date: ${escapeHtml(invoice.due_date)}</p>
            <p>Status: ${escapeHtml(invoice.status)}</p>
          </div>
        </header>
        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
          </thead>
          <tbody>${lineItems}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>Subtotal</span><strong>${formatMoney(invoice.subtotal)}</strong></div>
          <div class="row"><span>Discounts</span><strong>${formatMoney(invoice.discount_total)}</strong></div>
          <div class="row"><span>Total</span><strong>${formatMoney(invoice.total_amount)}</strong></div>
          <div class="row"><span>Paid</span><strong>${formatMoney(invoice.paid_amount)}</strong></div>
          <div class="row"><span>Balance Due</span><strong>${formatMoney(invoice.balance_due)}</strong></div>
        </div>
        <p class="note">Payment instructions: manual payment details will be provided by Safir Logistics.</p>
        ${invoice.notes ? `<p class="note">Notes: ${escapeHtml(invoice.notes)}</p>` : ""}
      </body>
    </html>
  `);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
