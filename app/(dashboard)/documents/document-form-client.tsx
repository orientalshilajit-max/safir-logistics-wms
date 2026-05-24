"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  inputClassName,
  LoadingState,
  Panel,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type IncomingShipment = Pick<Tables<"incoming_shipments">, "id" | "carrier" | "tracking_numbers">;
type ServiceRequest = Pick<Tables<"service_requests">, "id" | "request_number">;
type Invoice = Pick<Tables<"invoices">, "id" | "invoice_number">;
type DocumentCategory = Tables<"attachments">["category"];
type FileScope = Tables<"attachments">["file_scope"];
type DocumentFile = Tables<"attachments">;
type RelatedOptions = {
  products: Product[];
  shipments: IncomingShipment[];
  requests: ServiceRequest[];
  invoices: Invoice[];
};

export const documentCategories: DocumentCategory[] = [
  "Agreement",
  "Product Images",
  "Supplier Invoice",
  "Compliance",
  "General",
  "Other",
];

const acceptedExtensions = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
]);

const emptyRelated: RelatedOptions = {
  products: [],
  shipments: [],
  requests: [],
  invoices: [],
};

export function DocumentFormClient({
  documentId,
  initialClientId = "",
}: {
  documentId?: string;
  initialClientId?: string;
}) {
  const router = useRouter();
  const { clientId, role, user } = useAuth();
  const isAdmin = role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [document, setDocument] = useState<DocumentFile | null>(null);
  const [related, setRelated] = useState<RelatedOptions>(emptyRelated);
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [fileScope, setFileScope] = useState<FileScope>(initialClientId ? "client_specific" : "global");
  const [category, setCategory] = useState<DocumentCategory>("General");
  const [visibility, setVisibility] = useState<"internal" | "client">("client");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [serviceRequestId, setServiceRequestId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(Boolean(documentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveFileScope: FileScope = isAdmin ? fileScope : "client_specific";
  const effectiveClientId =
    effectiveFileScope === "global" ? "" : isAdmin ? selectedClientId : clientId ?? "";

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clientsResult, documentResult] = await Promise.all([
      isAdmin
        ? supabase
          .from("clients")
          .select("id, company_name")
          .is("deleted_at", null)
          .order("company_name")
        : Promise.resolve({ data: [], error: null }),
      documentId
        ? supabase
          .from("attachments")
          .select("*")
          .eq("id", documentId)
          .eq("entity_type", "documents")
          .is("deleted_at", null)
          .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (clientsResult.error) {
      setError(clientsResult.error.message);
    } else {
      setClients(clientsResult.data ?? []);
    }

    if (documentResult.error) {
      setError(documentResult.error.message);
    } else if (documentResult.data) {
      const loadedDocument = documentResult.data as DocumentFile;
      setDocument(loadedDocument);
      setFileScope(loadedDocument.file_scope);
      setSelectedClientId(loadedDocument.client_id ?? "");
      setCategory(loadedDocument.category);
      setVisibility(loadedDocument.visible_to_client ? "client" : "internal");
      setNote(loadedDocument.note ?? "");
      setProductId(loadedDocument.product_id ?? "");
      setShipmentId(loadedDocument.shipment_id ?? "");
      setServiceRequestId(loadedDocument.service_request_id ?? "");
      setInvoiceId(loadedDocument.invoice_id ?? "");
    }

    setLoading(false);
  }, [documentId, isAdmin]);

  const loadRelatedOptions = useCallback(async (nextClientId: string) => {
    if (!nextClientId) {
      setRelated(emptyRelated);
      return;
    }

    const [productsResult, shipmentsResult, requestsResult, invoicesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, product_name, sku")
        .eq("client_id", nextClientId)
        .is("deleted_at", null)
        .order("product_name"),
      supabase
        .from("incoming_shipments")
        .select("id, carrier, tracking_numbers")
        .eq("client_id", nextClientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("service_requests")
        .select("id, request_number")
        .eq("client_id", nextClientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("client_id", nextClientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const firstError =
      productsResult.error ?? shipmentsResult.error ?? requestsResult.error ?? invoicesResult.error;

    if (firstError) {
      setError(firstError.message);
      setRelated(emptyRelated);
      return;
    }

    setRelated({
      products: productsResult.data ?? [],
      shipments: shipmentsResult.data ?? [],
      requests: requestsResult.data ?? [],
      invoices: invoicesResult.data ?? [],
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialDocument() {
      await Promise.resolve();
      if (active) {
        await loadDocument();
      }
    }

    void loadInitialDocument();

    return () => {
      active = false;
    };
  }, [loadDocument]);

  useEffect(() => {
    let active = true;

    async function loadRelated() {
      await Promise.resolve();
      if (active) {
        await loadRelatedOptions(effectiveClientId);
      }
    }

    void loadRelated();

    return () => {
      active = false;
    };
  }, [effectiveClientId, loadRelatedOptions]);

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (effectiveFileScope === "client_specific" && !effectiveClientId) {
      setError(isAdmin ? "Choose a client before saving." : "Your account is missing a client assignment.");
      return;
    }

    if (effectiveFileScope === "global" && !isAdmin) {
      setError("Only admins can upload global files.");
      return;
    }

    if (!documentId && !file) {
      setError("Choose a file to upload.");
      return;
    }

    setSaving(true);
    setError(null);

    const entityId =
      effectiveFileScope === "global"
        ? document?.entity_id ?? crypto.randomUUID()
        : productId || shipmentId || serviceRequestId || invoiceId || effectiveClientId;

    const metadata = {
      client_id: effectiveFileScope === "global" ? null : effectiveClientId,
      file_scope: effectiveFileScope,
      category,
      visible_to_client: isAdmin ? visibility === "client" : true,
      note: note.trim() || null,
      product_id: effectiveFileScope === "global" ? null : productId || null,
      shipment_id: effectiveFileScope === "global" ? null : shipmentId || null,
      service_request_id: effectiveFileScope === "global" ? null : serviceRequestId || null,
      invoice_id: effectiveFileScope === "global" ? null : invoiceId || null,
      entity_id: entityId,
    };

    if (documentId) {
      const { error: updateError } = await supabase
        .from("attachments")
        .update(metadata)
        .eq("id", documentId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      router.push("/documents");
      router.refresh();
      return;
    }

    if (!file) {
      setSaving(false);
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!acceptedExtensions.has(extension)) {
      setError("Upload a PDF, image, Word, Excel, or CSV file.");
      setSaving(false);
      return;
    }

    const storagePath = [
      "documents",
      effectiveFileScope === "global" ? "global" : effectiveClientId,
      `${file.lastModified}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`,
    ].join("/");

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
      return;
    }

    const { data: signedUrl } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60);

    const uploadedByRole = isAdmin ? "admin" : "client";

    const { error: insertError } = await supabase.from("attachments").insert({
      ...metadata,
      entity_type: "documents",
      file_name: file.name,
      file_url: signedUrl?.signedUrl ?? storagePath,
      storage_path: storagePath,
      mime_type: file.type || null,
      uploaded_by: user?.email ?? uploadedByRole,
      uploaded_by_user_id: user?.id ?? null,
      uploaded_by_role: uploadedByRole,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push("/documents");
    router.refresh();
  }

  if (loading) {
    return <LoadingState label="Loading document..." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/documents" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Back to documents
        </Link>
      </div>
      <ErrorBanner message={error} />
      <Panel title={documentId ? "Edit document" : "Add document"} description={document ? document.file_name : undefined}>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void saveDocument(event)}>
          {isAdmin ? (
            <Field label="File scope">
              <select
                className={inputClassName}
                value={fileScope}
                onChange={(event) => {
                  const nextScope = event.target.value as FileScope;
                  setFileScope(nextScope);
                  if (nextScope === "global") {
                    setSelectedClientId("");
                    setProductId("");
                    setShipmentId("");
                    setServiceRequestId("");
                    setInvoiceId("");
                  }
                }}
              >
                <option value="global">Global file</option>
                <option value="client_specific">Client file</option>
              </select>
            </Field>
          ) : null}
          {isAdmin && fileScope === "client_specific" ? (
            <Field label="Client">
              <select className={inputClassName} value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} required>
                <option value="">Choose client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Category">
            <select className={inputClassName} value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
              {documentCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          {isAdmin ? (
            <Field label="Visibility">
              <select className={inputClassName} value={visibility} onChange={(event) => setVisibility(event.target.value as "internal" | "client")}>
                <option value="internal">Internal only</option>
                <option value="client">Visible to client</option>
              </select>
            </Field>
          ) : null}
          {!documentId ? (
            <Field label="File">
              <input className={inputClassName} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
            </Field>
          ) : null}
          {effectiveFileScope === "client_specific" ? (
            <>
              <Field label="Product">
                <select className={inputClassName} value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="">No product link</option>
                  {related.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.product_name}{product.sku ? ` (${product.sku})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Incoming shipment">
                <select className={inputClassName} value={shipmentId} onChange={(event) => setShipmentId(event.target.value)}>
                  <option value="">No shipment link</option>
                  {related.shipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.carrier} {shipment.tracking_numbers[0] ? `- ${shipment.tracking_numbers[0]}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service request">
                <select className={inputClassName} value={serviceRequestId} onChange={(event) => setServiceRequestId(event.target.value)}>
                  <option value="">No request link</option>
                  {related.requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.request_number}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice">
                <select className={inputClassName} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
                  <option value="">No invoice link</option>
                  {related.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          <div className="lg:col-span-2">
            <Field label="Notes">
              <textarea className={textAreaClassName} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for this file" />
            </Field>
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save document"}
            </Button>
            <Link href="/documents" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
      {!documentId && effectiveFileScope === "client_specific" && !effectiveClientId ? (
        <EmptyState title="Choose a client" body="Related object selectors load after a client is selected." />
      ) : null}
    </div>
  );
}

function sanitizeFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
