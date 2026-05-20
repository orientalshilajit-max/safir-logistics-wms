import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function InvoicesPage() {
  return <DashboardPage route={getDashboardRoute("/invoices")} />;
}
