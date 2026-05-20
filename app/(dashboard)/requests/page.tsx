import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function RequestsPage() {
  return <DashboardPage route={getDashboardRoute("/requests")} />;
}
