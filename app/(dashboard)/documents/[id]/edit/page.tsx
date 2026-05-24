import { DocumentFormClient } from "../../document-form-client";

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DocumentFormClient documentId={id} />;
}
