"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  StatusBadge,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
  textAreaClassName,
} from "@/app/components/wms-ui";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type IncomingShipment = Pick<Tables<"incoming_shipments">, "id" | "carrier" | "tracking_numbers">;
type ServiceRequest = Pick<Tables<"service_requests">, "id" | "request_number">;
type Invoice = Pick<Tables<"invoices">, "id" | "invoice_number">;
type DocumentCategory = Tables<"attachments">["category"];
type VisibilityFilter = "all" | "visible" | "internal";

type DocumentFile = Tables<"attachments"> & {
  clients: Client | null;
  products: Product | null;
  incoming_shipments: IncomingShipment | null;
  service_requests: ServiceRequest | null;
  invoices: Invoice | null;
  preview_url?: string;
};

type RelatedOptions = {
  products: Product[];
  shipments: IncomingShipment[];
  requests: ServiceRequest[];
  invoices: Invoice[];
};

const categories: DocumentCategory[] = [
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

export function DocumentsClient() {
  const { clientId, role, user } = useAuth();
  const isAdmin = role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [related, setRelated] = useState<RelatedOptions>(emptyRelated);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("General");
  const [visibility, setVisibility] = useState<"internal" | "client">("client");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [serviceRequestId, setServiceRequestId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [filterClientId, setFilterClientId] = useState("all");
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | "all">("all");
  const [filterUploadedBy, setFilterUploadedBy] = useState("all");
  const [filterVisibility, setFilterVisibility] = useState<VisibilityFilter>("all");
  const [previewDocument, setPreviewDocument] = useState<DocumentFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const effectiveUploadClientId = isAdmin ? selectedClientId : clientId ?? "";

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clientsResult, documentsResult] = await Promise.all([
      isAdmin
        ? supabase
          .from("clients")
          .select("id, company_name")
          .is("deleted_at", null)
          .order("company_name")
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("attachments")
        .select(
          "*, clients(id, company_name), products(id, product_name, sku), incoming_shipments(id, carrier, tracking_numbers), service_requests(id, request_number), invoices(id, invoice_number)",
        )
        .eq("entity_type", "documents")
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
    ]);

    if (clientsResult.error) {
      setError(clientsResult.error.message);
    } else {
      setClients(clientsResult.data ?? []);
    }

    if (documentsResult.error) {
      setError(documentsResult.error.message);
      setDocuments([]);
    } else {
      const rows = (documentsResult.data ?? []) as unknown as DocumentFile[];
      const rowsWithUrls = await Promise.all(
        rows.map(async (document) => ({
          ...document,
          preview_url: await getDocumentUrl(document),
        })),
      );
      setDocuments(rowsWithUrls);
    }

    setLoading(false);
  }, [isAdmin]);

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

    async function loadInitialDocuments() {
      await Promise.resolve();
      if (active) {
        await loadDocuments();
      }
    }

    void loadInitialDocuments();

    return () => {
      active = false;
    };
  }, [loadDocuments]);

  useEffect(() => {
    let active = true;

    async function loadRelated() {
      await Promise.resolve();
      if (active) {
        await loadRelatedOptions(effectiveUploadClientId);
      }
    }

    void loadRelated();

    return () => {
      active = false;
    };
  }, [effectiveUploadClientId, loadRelatedOptions]);

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        if (isAdmin && filterClientId !== "all" && document.client_id !== filterClientId) {
          return false;
        }

        if (filterCategory !== "all" && document.category !== filterCategory) {
          return false;
        }

        if (filterUploadedBy !== "all" && document.uploaded_by_role !== filterUploadedBy) {
          return false;
        }

        if (filterVisibility === "visible" && !document.visible_to_client) {
          return false;
        }

        if (filterVisibility === "internal" && document.visible_to_client) {
          return false;
        }

        return true;
      }),
    [documents, filterCategory, filterClientId, filterUploadedBy, filterVisibility, isAdmin],
  );

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;

    const uploadClientId = effectiveUploadClientId;

    if (!uploadClientId) {
      setError(isAdmin ? "Choose a client before uploading a file." : "Your account is missing a client assignment.");
      return;
    }

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!acceptedExtensions.has(extension)) {
      setError("Upload a PDF, image, Word, Excel, or CSV file.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    const storagePath = [
      "documents",
      uploadClientId,
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
      setUploading(false);
      return;
    }

    const { data: signedUrl } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60);

    const entityId = productId || shipmentId || serviceRequestId || invoiceId || uploadClientId;
    const uploadedByRole = isAdmin ? "admin" : role;
    const uploadedByLabel = user?.email ?? uploadedByRole;

    const { error: insertError } = await supabase.from("attachments").insert({
      client_id: uploadClientId,
      entity_type: "documents",
      entity_id: entityId,
      category,
      visible_to_client: isAdmin ? visibility === "client" : true,
      file_name: file.name,
      file_url: signedUrl?.signedUrl ?? storagePath,
      storage_path: storagePath,
      mime_type: file.type || null,
      uploaded_by: uploadedByLabel,
      uploaded_by_user_id: user?.id ?? null,
      uploaded_by_role: uploadedByRole,
      note: note.trim() || null,
      product_id: productId || null,
      shipment_id: shipmentId || null,
      service_request_id: serviceRequestId || null,
      invoice_id: invoiceId || null,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    resetUploadForm();
    setMessage("File uploaded.");
    await loadDocuments();
    setUploading(false);
  }

  async function archiveDocument(document: DocumentFile) {
    if (!window.confirm(`Archive ${document.file_name}?`)) {
      return;
    }

    setUpdatingId(document.id);
    setError(null);
    setMessage(null);

    const { error: archiveError } = await supabase
      .from("attachments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", document.id);

    if (archiveError) {
      setError(archiveError.message);
    } else {
      setMessage("File archived.");
      if (previewDocument?.id === document.id) {
        setPreviewDocument(null);
      }
      await loadDocuments();
    }

    setUpdatingId(null);
  }

  async function toggleVisibility(document: DocumentFile) {
    setUpdatingId(document.id);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("attachments")
      .update({ visible_to_client: !document.visible_to_client })
      .eq("id", document.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage(document.visible_to_client ? "File marked internal only." : "File marked visible to client.");
      await loadDocuments();
    }

    setUpdatingId(null);
  }

  function resetUploadForm() {
    setCategory("General");
    setVisibility("client");
    setNote("");
    setProductId("");
    setShipmentId("");
    setServiceRequestId("");
    setInvoiceId("");
    setFile(null);
    setFileInputKey((current) => current + 1);
  }

  function openPrintView(document: DocumentFile) {
    const url = document.preview_url ?? document.file_url;
    const popup = window.open("", "_blank", "noopener,noreferrer");

    if (!popup) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const escapedUrl = escapeHtml(url);
    const escapedName = escapeHtml(document.file_name);
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapedName}</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #fff; }
            .toolbar { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            button { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font-weight: 600; }
            iframe { display: block; width: 100vw; height: calc(100vh - 58px); border: 0; }
            @media print { .toolbar { display: none; } iframe { height: 100vh; } }
          </style>
        </head>
        <body>
          <div class="toolbar"><button onclick="window.print()">Print</button></div>
          <iframe src="${escapedUrl}" title="${escapedName}"></iframe>
        </body>
      </html>
    `);
    popup.document.close();
  }

  const selectedPreviewUrl = previewDocument?.preview_url ?? previewDocument?.file_url ?? null;
  const selectedPreviewMime = previewDocument?.mime_type ?? "";
  const canPreviewSelected =
    Boolean(selectedPreviewUrl) &&
    (selectedPreviewMime.includes("pdf") || selectedPreviewMime.startsWith("image/"));

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Files" description="Client-scoped documents stored in Supabase Storage.">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            {isAdmin ? (
              <select
                className={inputClassName}
                value={filterClientId}
                onChange={(event) => setFilterClientId(event.target.value)}
              >
                <option value="all">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className={inputClassName}
              value={filterCategory}
              onChange={(event) => setFilterCategory(event.target.value as DocumentCategory | "all")}
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className={inputClassName}
              value={filterUploadedBy}
              onChange={(event) => setFilterUploadedBy(event.target.value)}
            >
              <option value="all">Uploaded by anyone</option>
              <option value="admin">Admin</option>
              <option value="client">Client</option>
              <option value="warehouse_operator">Warehouse operator</option>
            </select>
            <select
              className={inputClassName}
              value={filterVisibility}
              onChange={(event) => setFilterVisibility(event.target.value as VisibilityFilter)}
            >
              <option value="all">All visibility</option>
              <option value="visible">Visible to client</option>
              <option value="internal">Internal only</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="Loading documents..." />
          ) : filteredDocuments.length === 0 ? (
            <EmptyState
              title="No files found"
              body={isAdmin ? "Upload a client file or adjust the filters." : "Files shared with your account will appear here."}
            />
          ) : (
            <div className="max-h-[34rem] overflow-auto">
              <table className={`${tableClassName} min-w-[980px]`}>
                <thead className={tableHeadClassName}>
                  <tr>
                    <th className={`${tableCellClassName} font-semibold`}>File</th>
                    {isAdmin ? <th className={`${tableCellClassName} font-semibold`}>Client</th> : null}
                    <th className={`${tableCellClassName} font-semibold`}>Category</th>
                    <th className={`${tableCellClassName} font-semibold`}>Visibility</th>
                    <th className={`${tableCellClassName} font-semibold`}>Uploaded by</th>
                    <th className={`${tableCellClassName} font-semibold`}>Related</th>
                    <th className={`${tableCellClassName} font-semibold`}>Created</th>
                    <th className={`${tableCellClassName} font-semibold`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocuments.map((document) => (
                    <tr key={document.id} className="hover:bg-slate-50">
                      <td className={`${tableCellClassName} font-medium text-slate-950`}>
                        <div>{document.file_name}</div>
                        {document.note ? (
                          <div className="mt-1 max-w-xs truncate text-xs font-normal text-slate-500">
                            {document.note}
                          </div>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <td className={`${tableCellClassName} text-slate-600`}>
                          {document.clients?.company_name ?? "Unknown"}
                        </td>
                      ) : null}
                      <td className={tableCellClassName}>
                        <StatusBadge tone="blue">{document.category}</StatusBadge>
                      </td>
                      <td className={tableCellClassName}>
                        <StatusBadge tone={document.visible_to_client ? "emerald" : "slate"}>
                          {document.visible_to_client ? "Visible to client" : "Internal only"}
                        </StatusBadge>
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        {formatRole(document.uploaded_by_role)}
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        {formatRelated(document)}
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        {formatDate(document.created_at)}
                      </td>
                      <td className={tableCellClassName}>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" onClick={() => setPreviewDocument(document)}>
                            Preview
                          </Button>
                          <a
                            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            href={document.preview_url ?? document.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                          <Button type="button" variant="secondary" onClick={() => openPrintView(document)}>
                            Print view
                          </Button>
                          {isAdmin ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={updatingId === document.id}
                                onClick={() => void toggleVisibility(document)}
                              >
                                {document.visible_to_client ? "Make internal" : "Make visible"}
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                disabled={updatingId === document.id}
                                onClick={() => void archiveDocument(document)}
                              >
                                Archive
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Upload file" description={isAdmin ? "Choose the client and file visibility." : "Files are assigned to your account automatically."}>
            <form className="space-y-4" onSubmit={(event) => void uploadDocument(event)}>
              {isAdmin ? (
                <Field label="Client">
                  <select
                    className={inputClassName}
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    required
                  >
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
                <select
                  className={inputClassName}
                  value={category}
                  onChange={(event) => setCategory(event.target.value as DocumentCategory)}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              {isAdmin ? (
                <Field label="Visibility">
                  <select
                    className={inputClassName}
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as "internal" | "client")}
                  >
                    <option value="internal">Internal only</option>
                    <option value="client">Visible to client</option>
                  </select>
                </Field>
              ) : null}

              <Field label="File">
                <input
                  key={fileInputKey}
                  className={inputClassName}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                />
              </Field>

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

              <Field label="Notes">
                <textarea
                  className={textAreaClassName}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional context for this file"
                />
              </Field>

              <Button type="submit" disabled={uploading}>
                {uploading ? "Uploading..." : "Upload file"}
              </Button>
            </form>
          </Panel>

          <Panel title="Preview" description="PDF and image files preview in place when supported.">
            {!previewDocument ? (
              <EmptyState title="No file selected" body="Choose Preview on a file row to inspect it here." />
            ) : canPreviewSelected && selectedPreviewUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-950">{previewDocument.file_name}</p>
                  <Button type="button" variant="secondary" onClick={() => openPrintView(previewDocument)}>
                    Print view
                  </Button>
                </div>
                <iframe
                  className="h-[28rem] w-full rounded-md border border-slate-200 bg-white"
                  src={selectedPreviewUrl}
                  title={previewDocument.file_name}
                />
              </div>
            ) : (
              <EmptyState
                title="Preview unavailable"
                body="This file type can be opened in a new tab."
                action={
                  selectedPreviewUrl ? (
                    <a
                      className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      href={selectedPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
                    </a>
                  ) : null
                }
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

async function getDocumentUrl(document: Tables<"attachments">) {
  if (!document.storage_path) {
    return document.file_url;
  }

  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, 60 * 60);

  return data?.signedUrl ?? document.file_url;
}

function sanitizeFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRole(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRelated(document: DocumentFile) {
  if (document.products) {
    return `Product: ${document.products.product_name}`;
  }

  if (document.incoming_shipments) {
    return `Shipment: ${document.incoming_shipments.carrier}`;
  }

  if (document.service_requests) {
    return `Request: ${document.service_requests.request_number}`;
  }

  if (document.invoices) {
    return `Invoice: ${document.invoices.invoice_number}`;
  }

  return "-";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
