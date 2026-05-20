import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function ServicesPage() {
  return <DashboardPage route={getDashboardRoute("/services")} />;
}
