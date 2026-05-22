const badgeStyles = {
  Live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Setup: "border-blue-200 bg-blue-50 text-blue-700",
  Draft: "border-slate-200 bg-slate-100 text-slate-600",
};

const metrics = [
  ["Inbound units", "1,284", "+12%"],
  ["Open requests", "47", "8 urgent"],
  ["Shipments today", "32", "14 ready"],
  ["Billable services", "$8.6k", "This week"],
];

const activityRows = [
  ["FBA-2048", "Receiving", "Awaiting count", "Setup"],
  ["SKU-88421", "Inventory", "Prep ready", "Live"],
  ["REQ-1172", "Requests", "Needs review", "Draft"],
  ["OUT-6409", "Outbound", "Carrier booked", "Live"],
];

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, detail]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-slate-950">
                {value}
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {detail}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Operational queue</h3>
              <p className="text-sm text-slate-500">Static UI scaffolding for future workflows.</p>
            </div>
            <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              No logic wired
            </span>
          </div>
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 font-semibold">Area</th>
                  <th className="px-5 py-3 font-semibold">State</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityRows.map(([reference, area, state, status]) => (
                  <tr key={reference} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-950">{reference}</td>
                    <td className="px-5 py-4 text-slate-600">{area}</td>
                    <td className="px-5 py-4 text-slate-600">{state}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeStyles[status as keyof typeof badgeStyles]}`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-950">Detail panel</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Ready
            </span>
          </div>
          <div className="mt-5 space-y-4">
            <PanelBlock title="Selected record" value="No selection" />
            <PanelBlock title="Next milestone" value="Placeholder timeline" />
            <PanelBlock title="Client context" value="Reserved for account notes" />
          </div>
        </aside>
      </section>
    </div>
  );
}

function PanelBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
