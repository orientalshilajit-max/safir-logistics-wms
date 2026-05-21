"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PageHeader,
  Panel,
  QuickFilterButton,
  StatusBadge,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<
  Tables<"products">,
  "id" | "product_name" | "sku" | "fnsku" | "barcode" | "barcode_type"
>;
type ServiceRequest = Pick<Tables<"service_requests">, "id" | "request_number" | "status">;
type RequestBox = Pick<
  Tables<"request_boxes">,
  "id" | "box_number" | "tracking_number" | "box_barcode" | "box_barcode_type"
>;
type WarehouseTask = Tables<"warehouse_tasks"> & {
  clients: Client | null;
  products: Product | null;
  request_boxes: RequestBox | null;
  service_requests: ServiceRequest | null;
};
type InventoryRow = Tables<"inventory"> & {
  clients: Client | null;
  products: Product | null;
};

type TaskStatus = WarehouseTask["status"];
type TaskPriority = WarehouseTask["priority"];

const statusColumns: TaskStatus[] = [
  "Pending",
  "Picking",
  "Packing",
  "QC",
  "Ready to Ship",
  "Completed",
];

const priorityOrder: Record<TaskPriority, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

const priorityTones: Record<TaskPriority, "slate" | "amber" | "rose" | "orange"> = {
  Low: "slate",
  Normal: "amber",
  High: "orange",
  Urgent: "rose",
};

const statusTones: Record<TaskStatus, "slate" | "blue" | "amber" | "emerald" | "rose" | "cyan"> = {
  Pending: "slate",
  Picking: "blue",
  Packing: "amber",
  QC: "cyan",
  "Ready to Ship": "emerald",
  Completed: "emerald",
  "On Hold": "rose",
  Cancelled: "slate",
};

export function WarehouseTasksClient() {
  const { role, user } = useAuth();
  const [tasks, setTasks] = useState<WarehouseTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [clientFilter, setClientFilter] = useState("all");
  const [requestFilter, setRequestFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>("Picking");
  const [bulkAssignedTo, setBulkAssignedTo] = useState("");
  const [adjustInventoryId, setAdjustInventoryId] = useState("");
  const [availableDelta, setAvailableDelta] = useState("0");
  const [reservedDelta, setReservedDelta] = useState("0");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOperate = role === "admin" || role === "warehouse_operator";
  const requestOptions = useMemo(() => {
    const map = new Map<string, ServiceRequest>();

    tasks.forEach((task) => {
      if (task.service_requests) {
        map.set(task.service_requests.id, task.service_requests);
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.request_number.localeCompare(b.request_number),
    );
  }, [tasks]);
  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const matchesClient = clientFilter === "all" || task.client_id === clientFilter;
        const matchesRequest =
          requestFilter === "all" || task.service_request_id === requestFilter;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active"
            ? task.status !== "Completed" && task.status !== "Cancelled"
            : task.status === statusFilter);
        const matchesAssigned =
          !assignedFilter.trim() ||
          (task.assigned_to ?? "").toLowerCase().includes(assignedFilter.trim().toLowerCase());

        return matchesClient && matchesRequest && matchesStatus && matchesAssigned;
      })
      .sort((a, b) => {
        const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];

        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
      });
  }, [assignedFilter, clientFilter, requestFilter, statusFilter, tasks]);
  const activeCount = tasks.filter(
    (task) => task.status !== "Completed" && task.status !== "Cancelled",
  ).length;

  const loadData = useCallback(async () => {
    setError(null);

    const [tasksResult, clientsResult, inventoryResult] = await Promise.all([
      supabase
        .from("warehouse_tasks")
        .select(
          "*, clients(id, company_name), service_requests(id, request_number, status), products(id, product_name, sku, fnsku, barcode, barcode_type), request_boxes(id, box_number, tracking_number, box_barcode, box_barcode_type)",
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, company_name")
        .is("deleted_at", null)
        .order("company_name"),
      supabase
        .from("inventory")
        .select("*, clients(id, company_name), products!inventory_product_id_fkey(id, product_name, sku, fnsku, barcode, barcode_type)")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
    ]);

    if (tasksResult.error) setError(tasksResult.error.message);
    else setTasks((tasksResult.data ?? []) as WarehouseTask[]);

    if (clientsResult.error) setError(clientsResult.error.message);
    else setClients(clientsResult.data ?? []);

    if (inventoryResult.error) setError(inventoryResult.error.message);
    else setInventory((inventoryResult.data ?? []) as InventoryRow[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadData(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  function toggleTask(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    await runTaskUpdate([taskId], { status });
  }

  async function runTaskUpdate(ids: string[], patch: Partial<Tables<"warehouse_tasks">>) {
    if (ids.length === 0) {
      setError("Select at least one warehouse task first.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("warehouse_tasks")
      .update(patch)
      .in("id", ids);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSelectedIds(new Set());
      await loadData();
    }

    setSaving(false);
  }

  async function applyBulkStatus() {
    await runTaskUpdate(Array.from(selectedIds), { status: bulkStatus });
  }

  async function markSelectedCompleted() {
    await runTaskUpdate(Array.from(selectedIds), { status: "Completed" });
  }

  async function assignSelected() {
    await runTaskUpdate(Array.from(selectedIds), {
      assigned_to: bulkAssignedTo.trim() || user?.id || null,
    });
  }

  async function adjustInventory() {
    if (saving) {
      return;
    }

    const row = inventory.find((item) => item.id === adjustInventoryId);

    if (!row) {
      setError("Select an inventory row to adjust.");
      return;
    }

    const nextAvailable = row.available_qty + Number(availableDelta || 0);
    const nextReserved = row.reserved_qty + Number(reservedDelta || 0);
    const availableChange = Number(availableDelta || 0);
    const reservedChange = Number(reservedDelta || 0);

    if (!Number.isInteger(availableChange) || !Number.isInteger(reservedChange)) {
      setError("Inventory adjustment deltas must be whole numbers.");
      return;
    }

    if (availableChange === 0 && reservedChange === 0) {
      setError("Enter at least one inventory adjustment delta.");
      return;
    }

    if (nextAvailable < 0 || nextReserved < 0) {
      setError("Inventory adjustment would create a negative quantity.");
      return;
    }

    if (
      !window.confirm(
        `Adjust inventory for ${row.products?.product_name ?? "this product"}?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase.rpc("adjust_inventory_quantities", {
      p_inventory_id: row.id,
      p_available_delta: availableChange,
      p_reserved_delta: reservedChange,
      p_processing_delta: 0,
      p_shipped_delta: 0,
      p_damaged_delta: 0,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      await supabase.from("warehouse_tasks").insert({
        client_id: row.client_id,
        product_id: row.product_id,
        task_type: "inventory_adjustment",
        status: "Completed",
        priority: "Normal",
        quantity: Math.abs(availableChange) + Math.abs(reservedChange),
        assigned_to: user?.id ?? null,
        barcode: row.products?.barcode ?? row.products?.fnsku ?? row.products?.sku ?? null,
        internal_notes: adjustmentNote || "Bulk inventory adjustment",
      });
      setAvailableDelta("0");
      setReservedDelta("0");
      setAdjustmentNote("");
      await loadData();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Warehouse Task Queue"
        description="Run picking, packing, QC, and ready-to-ship work from a fast operational queue."
        action={<StatusBadge tone="blue">{activeCount} active tasks</StatusBadge>}
      />
      <ErrorBanner message={error} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active" value={activeCount} />
        <Metric label="Selected" value={selectedIds.size} />
        <Metric label="Urgent" value={tasks.filter((task) => task.priority === "Urgent").length} />
        <Metric label="Completed" value={tasks.filter((task) => task.status === "Completed").length} />
      </section>

      <Panel title="Queue filters" description="Narrow the operational board without leaving the workflow.">
        <div className="mb-4 flex flex-wrap gap-2">
          <QuickFilterButton active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
            Active
          </QuickFilterButton>
          <QuickFilterButton active={statusFilter === "Picking"} onClick={() => setStatusFilter("Picking")}>
            Picking
          </QuickFilterButton>
          <QuickFilterButton active={statusFilter === "Packing"} onClick={() => setStatusFilter("Packing")}>
            Packing
          </QuickFilterButton>
          <QuickFilterButton active={statusFilter === "QC"} onClick={() => setStatusFilter("QC")}>
            QC
          </QuickFilterButton>
          <QuickFilterButton active={statusFilter === "Ready to Ship"} onClick={() => setStatusFilter("Ready to Ship")}>
            Ready
          </QuickFilterButton>
          <QuickFilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </QuickFilterButton>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Client">
            <select
              className={inputClassName}
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Request">
            <select
              className={inputClassName}
              value={requestFilter}
              onChange={(event) => setRequestFilter(event.target.value)}
            >
              <option value="all">All requests</option>
              {requestOptions.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.request_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">Active work</option>
              <option value="all">All statuses</option>
              {statusColumns.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
              <option value="On Hold">On Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Assigned user">
            <input
              className={inputClassName}
              placeholder="User id"
              value={assignedFilter}
              onChange={(event) => setAssignedFilter(event.target.value)}
            />
          </Field>
        </div>
      </Panel>

      {canOperate ? (
        <Panel title="Bulk actions" description="Apply high-frequency warehouse actions to selected tasks.">
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Bulk status">
                <select
                  className={inputClassName}
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value as TaskStatus)}
                >
                  {statusColumns.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                  <option value="On Hold">On Hold</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Assign operator">
                <input
                  className={inputClassName}
                  placeholder={user?.id ? "Leave blank for yourself" : "Operator user id"}
                  value={bulkAssignedTo}
                  onChange={(event) => setBulkAssignedTo(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                <Button disabled={saving || selectedIds.size === 0} onClick={applyBulkStatus} title="Apply selected status">
                  Update status
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving || selectedIds.size === 0}
                  onClick={assignSelected}
                  title="Assign selected tasks"
                >
                  Assign
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving || selectedIds.size === 0}
                  onClick={markSelectedCompleted}
                  title="Mark selected tasks completed"
                >
                  Mark completed
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Inventory adjustment">
                  <select
                    className={inputClassName}
                    value={adjustInventoryId}
                    onChange={(event) => setAdjustInventoryId(event.target.value)}
                  >
                    <option value="">Select inventory</option>
                    {inventory.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.products?.product_name ?? "Unknown"} - {row.clients?.company_name ?? "Client"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Available delta">
                  <input
                    className={inputClassName}
                    type="number"
                    value={availableDelta}
                    onChange={(event) => setAvailableDelta(event.target.value)}
                  />
                </Field>
                <Field label="Reserved delta">
                  <input
                    className={inputClassName}
                    type="number"
                    value={reservedDelta}
                    onChange={(event) => setReservedDelta(event.target.value)}
                  />
                </Field>
                <div className="flex items-end">
                  <Button disabled={saving || !adjustInventoryId} onClick={adjustInventory}>
                    Apply adjustment
                  </Button>
                </div>
              </div>
              <textarea
                className={`${textAreaClassName} mt-3 min-h-16`}
                placeholder="Internal adjustment note"
                value={adjustmentNote}
                onChange={(event) => setAdjustmentNote(event.target.value)}
              />
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Operational board" description="Grouped by pick, pack, QC, and shipping-ready states.">
        {loading ? (
          <LoadingState label="Loading warehouse tasks..." />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title="No warehouse tasks match these filters"
            body="Try another status chip, clear filters, or approve a service request to generate operational work."
          />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 pb-2">
            <div className="grid min-w-[72rem] gap-4 xl:min-w-0 xl:grid-cols-3 2xl:grid-cols-6">
            {statusColumns.map((status) => {
              const columnTasks = filteredTasks.filter((task) => task.status === status);

              return (
                <section key={status} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-950">{status}</h3>
                    <StatusBadge tone={statusTones[status]}>{columnTasks.length}</StatusBadge>
                  </div>
                  <div className="space-y-3 p-3">
                    {columnTasks.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">
                        Clear
                      </p>
                    ) : (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          checked={selectedIds.has(task.id)}
                          disabled={saving || !canOperate}
                          onToggle={() => toggleTask(task.id)}
                          onStatusChange={(nextStatus) => void updateTaskStatus(task.id, nextStatus)}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TaskCard({
  task,
  checked,
  disabled,
  onToggle,
  onStatusChange,
}: {
  task: WarehouseTask;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onStatusChange: (status: TaskStatus) => void;
}) {
  const barcode = task.barcode ?? task.products?.barcode ?? task.products?.fnsku ?? task.products?.sku;

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition focus-within:border-slate-400 hover:border-slate-300"
      onKeyDown={(event) => {
        if (disabled) return;
        const shortcut = event.key.toLowerCase();
        const shortcutStatus: Record<string, TaskStatus> = {
          "1": "Picking",
          "2": "Packing",
          "3": "QC",
          "4": "Ready to Ship",
          "5": "Completed",
        };

        if (shortcut in shortcutStatus) {
          event.preventDefault();
          onStatusChange(shortcutStatus[shortcut]);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 size-6 rounded border-slate-300 text-slate-950 focus:ring-4 focus:ring-slate-200"
          aria-label={`Select ${task.task_type} task`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={priorityTones[task.priority]}>{task.priority}</StatusBadge>
            <StatusBadge tone={statusTones[task.status]}>{task.status}</StatusBadge>
          </div>
          <h4 className="mt-3 text-sm font-semibold text-slate-950">
            {formatTaskType(task.task_type)}
          </h4>
          <p className="mt-1 truncate text-sm text-slate-600">
            {task.products?.product_name ?? (task.request_boxes ? "Box workflow" : "General warehouse work")}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-slate-500">
        <Detail label="Client" value={task.clients?.company_name ?? "Unknown"} />
        <Detail label="Request" value={task.service_requests?.request_number ?? "-"} />
        <Detail label="Quantity" value={String(task.quantity)} />
        <Detail label="Due" value={task.due_date ?? "No due date"} />
        <Detail label="Assigned" value={task.assigned_to ?? "Unassigned"} />
        <Detail label="Barcode" value={barcode ?? "Not set"} />
        {task.request_boxes ? (
          <Detail
            label="Box"
            value={`#${task.request_boxes.box_number}${task.request_boxes.tracking_number ? ` - ${task.request_boxes.tracking_number}` : ""}`}
          />
        ) : null}
      </dl>

      {task.internal_notes ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          {task.internal_notes}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["Picking", "Packing", "QC", "Ready to Ship", "Completed"] as TaskStatus[]).map(
          (status) => (
            <button
              key={status}
              disabled={disabled}
              onClick={() => onStatusChange(status)}
              title={`Shortcut ${statusShortcut(status)}`}
              className="min-h-12 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {status}
            </button>
          ),
        )}
      </div>
    </article>
  );
}

function statusShortcut(status: TaskStatus) {
  const shortcuts: Partial<Record<TaskStatus, string>> = {
    Picking: "1",
    Packing: "2",
    QC: "3",
    "Ready to Ship": "4",
    Completed: "5",
  };

  return shortcuts[status] ?? "";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <dt className="shrink-0 font-medium text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function formatTaskType(taskType: WarehouseTask["task_type"]) {
  return taskType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
