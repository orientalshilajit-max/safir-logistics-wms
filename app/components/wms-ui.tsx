import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            {description}
          </p>
        </div>
        {action}
      </div>
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400",
    secondary:
      "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
    danger:
      "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:text-rose-300",
  };

  return (
    <button
      {...props}
      className={[
        "inline-flex h-9 items-center justify-center rounded-md px-3.5 text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed",
        styles[variant],
        props.className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClassName =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-500";

export const textAreaClassName =
  "min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

export const tableClassName =
  "w-full text-left text-sm tabular-nums";

export const tableHeadClassName =
  "sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur";

export const tableCellClassName =
  "px-3 py-2.5 align-middle";

export function StatusBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "emerald" | "blue" | "amber" | "rose" | "orange" | "indigo" | "cyan";
}) {
  const styles = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    orange: "bg-orange-50 text-orange-700",
    indigo: "bg-indigo-50 text-indigo-700",
    cyan: "bg-cyan-50 text-cyan-700",
  };

  return (
    <span
      className={`inline-flex w-fit shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="size-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-950" />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <div className="mt-5 grid gap-3">
        <span className="h-3 w-3/4 animate-pulse rounded-full bg-slate-100" />
        <span className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
        <span className="h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center sm:p-8">
      <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
        -
      </div>
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function QuickFilterButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      {...props}
      className={[
        "min-h-8 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-4 focus:ring-slate-100",
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
        props.className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
