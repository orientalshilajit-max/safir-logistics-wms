import { DashboardPage } from "@/app/components/dashboard-page";
import { getDashboardRoute } from "@/app/lib/dashboard";

export default function OutboundShipmentsPage() {
  return <DashboardPage route={getDashboardRoute("/outbound-shipments")} />;
}
