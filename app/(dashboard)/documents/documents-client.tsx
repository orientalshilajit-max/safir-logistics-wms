"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  inputClassName,
  LoadingState,
  Panel,
  StatusBadge,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
} from "@/app/components/wms-ui";
import { documentCategories } from "./document-form-client";

type Client = Pick<Tables<"clients">, "id" | "company_name">;
type Product = Pick<Tables<"products">, "id" | "product_name" | "sku">;
type IncomingShipment = Pick<Tables<"incoming_shipments">, "id" | "carrier" | "tracking_numbers">;
type ServiceRequest = Pick<Tables<"service_requests">, "id" | "request_number">;
type Invoice = Pick<Tables<"invoices">, "id" | "invoice_number">;
type DocumentCategory = Tables<"attachments">["category"];
type FileScope = Tables<"attachments">["file_scope"];
type VisibilityFilter = "all" | "visible" | "internal";
type ScopeFilter = "all" | FileScope;

type DocumentFile = Tables<"attachments"> & {
  clients: Client | null;
  products: Product | null;
  incoming_shipments: IncomingShipment | null;
  service_requests: ServiceRequest | null;
  invoices: Invoice | null;
  preview_url?: string;
};

export function DocumentsClient() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [scopeTab, setScopeTab] = useState<ScopeFilter>("all");
  const [filterScope, setFilterScope] = useState<ScopeFilter>("all");
  const [filterClientId, setFilterClientId] = useState("all");
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | "all">("all");
  const [filterUploadedBy, setFilterUploadedBy] = useState("all");
  const [filterVisibility, setFilterVisibility] = useState<VisibilityFilter>("all");
  const [previewDocument, setPreviewDocument] = useState<DocumentFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const activeScope = scopeTab !== "all" ? scopeTab : filterScope;

        if (activeScope !== "all" && document.file_scope !== activeScope) {
          return false;
        }

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
    [documents, filterCategory, filterClientId, filterScope, filterUploadedBy, filterVisibility, isAdmin, scopeTab],
  );

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
        <div className="flex items-center justify-between gap-3 xl:col-span-2">
          <StatusBadge tone="blue">{documents.length} files</StatusBadge>
          <Link
            href="/documents/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Document
          </Link>
        </div>
        <Panel title="Files" description="Global and client-specific documents stored in Supabase Storage.">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["all", "All Files"],
              ["global", "Global Files"],
              ["client_specific", "Client Files"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition ${
                  scopeTab === value
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setScopeTab(value as ScopeFilter)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            {isAdmin ? (
              <select
                className={inputClassName}
                value={filterScope}
                onChange={(event) => setFilterScope(event.target.value as ScopeFilter)}
              >
                <option value="all">All scopes</option>
                <option value="global">Global files</option>
                <option value="client_specific">Client files</option>
              </select>
            ) : null}
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
              {documentCategories.map((item) => (
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
                    <th className={`${tableCellClassName} font-semibold`}>Scope</th>
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
                      <td className={tableCellClassName}>
                        <StatusBadge tone={document.file_scope === "global" ? "indigo" : "blue"}>
                          {formatScope(document.file_scope)}
                        </StatusBadge>
                      </td>
                      {isAdmin ? (
                        <td className={`${tableCellClassName} text-slate-600`}>
                          {document.file_scope === "global" ? "All clients" : document.clients?.company_name ?? "Unknown"}
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
                          {isAdmin || (document.file_scope === "client_specific" && document.uploaded_by_user_id === user?.id) ? (
                            <Link
                              href={`/documents/${document.id}/edit`}
                              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Edit
                            </Link>
                          ) : null}
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
                              <Button type="button" variant="secondary" disabled={updatingId === document.id} onClick={() => void toggleVisibility(document)}>
                                {document.visible_to_client ? "Make internal" : "Make visible"}
                              </Button>
                              <Button type="button" variant="danger" disabled={updatingId === document.id} onClick={() => void archiveDocument(document)}>
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

function formatScope(value: FileScope) {
  return value === "global" ? "Global" : "Client file";
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
