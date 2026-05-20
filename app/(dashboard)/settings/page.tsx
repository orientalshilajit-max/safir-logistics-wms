import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function SettingsPage() {
  return <DashboardPage route={getDashboardRoute("/settings")} />;
}
