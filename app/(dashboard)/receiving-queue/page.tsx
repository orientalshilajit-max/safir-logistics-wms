import { redirect } from "next/navigation";

export default function ReceivingQueuePage() {
  redirect("/incoming-shipments?status=pending_receiving");
}
