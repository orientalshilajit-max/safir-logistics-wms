import { DocumentFormClient } from "../document-form-client";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams?: Promise<{ client_id?: string }>;
}) {
  const params = await searchParams;

  return <DocumentFormClient initialClientId={params?.client_id ?? ""} />;
}
