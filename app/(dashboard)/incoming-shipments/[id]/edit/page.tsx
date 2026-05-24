import { IncomingShipmentFormClient } from "../../incoming-shipment-form-client";

export default async function EditIncomingShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <IncomingShipmentFormClient shipmentId={id} />;
}
