import { IncomingShipmentsClient } from "@/app/(dashboard)/incoming-shipments/incoming-shipments-client";

export default async function IncomingShipmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;

  return <IncomingShipmentsClient initialStatus={params?.status} />;
}
