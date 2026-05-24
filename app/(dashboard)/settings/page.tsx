import { Panel, StatusBadge } from "@/app/components/wms-ui";

const settings = [
  ["Company info", "Business profile, contact details, and prep center identity."],
  ["Invoice defaults", "Due dates, payment instructions, logo, and billing notes."],
  ["Admin users", "Team access and admin role management."],
  ["Notifications", "Operational alerts for requests, shipments, inventory, and invoices."],
  ["File categories", "Document categories for agreements, compliance, invoices, and product files."],
  ["Future integrations", "Carrier, marketplace, accounting, and printing connections."],
];

export default function SettingsPage() {
  return (
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
  );
}
