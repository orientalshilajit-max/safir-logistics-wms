"use client";

import { IncomingShipmentsClient } from "../incoming-shipments/incoming-shipments-client";

export function ReceivingQueueClient() {
  return <IncomingShipmentsClient initialStatus="pending_receiving" />;
}
