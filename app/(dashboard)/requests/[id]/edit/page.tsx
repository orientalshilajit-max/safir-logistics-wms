import { RequestFormClient } from "../../request-form-client";

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <RequestFormClient requestId={id} />;
}
