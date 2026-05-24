import { ServiceFormClient } from "../../service-form-client";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ServiceFormClient serviceId={id} />;
}
