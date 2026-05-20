import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function ReportsPage() {
  return <DashboardPage route={getDashboardRoute("/reports")} />;
}
