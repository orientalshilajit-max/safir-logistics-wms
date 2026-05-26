import { ShipmentDetailClient } from "../shipment-detail-client";

export default async function IncomingShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ShipmentDetailClient shipmentId={id} />;
}
