import { ClientFormClient } from "../../client-form-client";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ClientFormClient clientId={id} />;
}
