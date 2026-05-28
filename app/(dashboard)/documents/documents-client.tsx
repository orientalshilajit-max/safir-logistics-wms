"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { CLIENT_ACCOUNT_LINK_ERROR } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
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
  const { role, user, clientId } = useAuth();
  const isAdmin = role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [scopeTab, setScopeTab] = useState<ScopeFilter>("all");
  const [filterScope, setFilterScope] = useState<ScopeFilter>("all");
  const [filterClientId, setFilterClientId] = useState("all");
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | "all">("all");
  const [filterUploadedBy, setFilterUploadedBy] = useState("all");
  const [filterVisibility, setFilterVisibility] = useState<VisibilityFilter>("all");
  const [fileQuery, setFileQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("All Files");
  const [previewDocument, setPreviewDocument] = useState<DocumentFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isAdmin && !clientId) {
      setClients([]);
      setDocuments([]);
      setError(CLIENT_ACCOUNT_LINK_ERROR);
      setLoading(false);
      return;
    }

    let documentsQuery = supabase
      .from("attachments")
      .select(
        "*, clients(id, company_name), products(id, product_name, sku), incoming_shipments(id, carrier, tracking_numbers), service_requests(id, request_number), invoices(id, invoice_number)",
      )
      .eq("entity_type", "documents")
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      documentsQuery = documentsQuery
        .eq("client_id", clientId as string)
        .eq("file_scope", "client_specific")
        .or(`visible_to_client.eq.true,uploaded_by_user_id.eq.${user?.id ?? ""}`);
    }

    const [clientsResult, documentsResult] = await Promise.all([
      isAdmin
        ? supabase
          .from("clients")
          .select("id, company_name")
          .is("deleted_at", null)
          .order("company_name")
        : Promise.resolve({ data: [], error: null }),
      documentsQuery,
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
  }, [clientId, isAdmin, user?.id]);

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
  const clientDocuments = useMemo(() => {
    const normalized = fileQuery.trim().toLowerCase();

    return filteredDocuments.filter((document) => {
      const allowed =
        document.file_scope === "client_specific" &&
        document.client_id === clientId &&
        (document.visible_to_client || document.uploaded_by_user_id === user?.id);
      const matchesQuery =
        !normalized ||
        document.file_name.toLowerCase().includes(normalized) ||
        document.category.toLowerCase().includes(normalized) ||
        (document.mime_type ?? "").toLowerCase().includes(normalized);
      const extension = getFileType(document);
      const matchesType = fileTypeFilter === "all" || extension === fileTypeFilter;
      const matchesDate = dateFilter === "all" || isWithinDateFilter(document.created_at, dateFilter);
      const matchesFolder = folderFilter === "All Files" || documentFolder(document) === folderFilter;

      return allowed && matchesQuery && matchesType && matchesDate && matchesFolder;
    });
  }, [clientId, dateFilter, fileQuery, fileTypeFilter, filteredDocuments, folderFilter, user?.id]);

  useEffect(() => {
    if (!previewDocument) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewDocument(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewDocument]);

  if (!isAdmin) {
    const folderNames = [
      "All Files",
      "Incoming Shipments",
      "Order Service",
      "Invoices",
      "Product Documents",
      "Labels & Packing Slips",
      "Statements",
      "Other",
      "Archive",
    ];
    const fileTypes = Array.from(new Set(documents.map(getFileType))).filter(Boolean).sort();
    const recentlyAdded = documents.filter((document) => isWithinDateFilter(document.created_at, "week")).length;

    return (
      <div className="space-y-5">
        <ErrorBanner message={error} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Files & Documents</h2>
          <Link
            href="/documents/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Upload Files
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FileMetric label="Total Files" value={clientDocuments.length} sublabel="Allowed files" />
          <FileMetric label="Folders / Categories" value={folderNames.length - 1} sublabel="Folders" />
          <FileMetric label="Storage Used" value={0} sublabel="Tracked in storage" />
          <FileMetric label="Recently Added" value={recentlyAdded} sublabel="Files this week" />
        </section>

        <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <Panel title="Folders">
            <div className="space-y-1">
              {folderNames.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  className={[
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition",
                    folderFilter === folder ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => setFolderFilter(folder)}
                >
                  <span>{folder}</span>
                  <span className="text-xs text-slate-400">
                    {folder === "All Files" ? clientDocuments.length : documents.filter((document) => documentFolder(document) === folder).length}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Files">
            <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
              <input
                className={inputClassName}
                placeholder="Search files by name, type, or folder"
                value={fileQuery}
                onChange={(event) => setFileQuery(event.target.value)}
              />
              <select
                className={inputClassName}
                value={fileTypeFilter}
                onChange={(event) => setFileTypeFilter(event.target.value)}
              >
                <option value="all">All types</option>
                {fileTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                className={inputClassName}
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
            </div>

            {loading ? (
              <LoadingState label="Loading documents..." />
            ) : clientDocuments.length === 0 ? (
              <EmptyState title="No files found" body="Files shared with your account will appear here." />
            ) : (
              <div className="max-h-[42rem] overflow-auto">
                <table className={`${tableClassName} min-w-[820px]`}>
                  <thead className={tableHeadClassName}>
                    <tr>
                      <th className={`${tableCellClassName} font-semibold`}>Preview / File</th>
                      <th className={`${tableCellClassName} font-semibold`}>Folder / Category</th>
                      <th className={`${tableCellClassName} font-semibold`}>Type</th>
                      <th className={`${tableCellClassName} font-semibold`}>Uploaded By</th>
                      <th className={`${tableCellClassName} font-semibold`}>Upload Date</th>
                      <th className={`${tableCellClassName} font-semibold`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientDocuments.map((document) => (
                      <tr key={document.id} className="hover:bg-slate-50">
                        <td className={`${tableCellClassName} max-w-sm font-medium text-slate-950`}>
                          <FilePreviewCell document={document} onPreview={setPreviewDocument} />
                        </td>
                        <td className={`${tableCellClassName} text-slate-600`}>{documentFolder(document)}</td>
                        <td className={`${tableCellClassName} text-slate-600`}>{getFileType(document).toUpperCase()}</td>
                        <td className={`${tableCellClassName} text-slate-600`}>{formatRole(document.uploaded_by_role)}</td>
                        <td className={`${tableCellClassName} text-slate-600`}>{formatDate(document.created_at)}</td>
                        <td className={tableCellClassName}>
                          <div className="flex flex-wrap gap-1.5">
                            <a
                              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              href={document.preview_url ?? document.file_url}
                              download={document.file_name}
                            >
                              Download
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <FilePreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Documents & Files</h2>
          <Link
            href="/documents/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Document
          </Link>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FileMetric label="Total Files" value={documents.length} sublabel="All files" />
          <FileMetric label="Global Files" value={documents.filter((document) => document.file_scope === "global").length} sublabel="Shared" />
          <FileMetric label="Client Files" value={documents.filter((document) => document.file_scope === "client_specific").length} sublabel="Client-specific" />
          <FileMetric label="Recently Added" value={documents.filter((document) => isWithinDateFilter(document.created_at, "week")).length} sublabel="This week" />
        </section>
        <Panel title="Files">
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
              <table className={`${tableClassName} min-w-[900px]`}>
                <thead className={tableHeadClassName}>
                  <tr>
                    <th className={`${tableCellClassName} font-semibold`}>Preview / File</th>
                    <th className={`${tableCellClassName} font-semibold`}>Folder / Category</th>
                    <th className={`${tableCellClassName} font-semibold`}>Type</th>
                    <th className={`${tableCellClassName} font-semibold`}>Uploaded By</th>
                    <th className={`${tableCellClassName} font-semibold`}>Upload Date</th>
                    <th className={`${tableCellClassName} font-semibold`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocuments.map((document) => (
                    <tr key={document.id} className="hover:bg-slate-50">
                      <td className={`${tableCellClassName} max-w-sm font-medium text-slate-950`}>
                        <FilePreviewCell document={document} onPreview={setPreviewDocument} />
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        <div className="space-y-1">
                          <p>{documentFolder(document)}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge tone={document.file_scope === "global" ? "indigo" : "blue"}>
                              {formatScope(document.file_scope)}
                            </StatusBadge>
                            <StatusBadge tone={document.visible_to_client ? "emerald" : "slate"}>
                              {document.visible_to_client ? "Visible" : "Internal"}
                            </StatusBadge>
                          </div>
                        </div>
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>{getFileType(document).toUpperCase()}</td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        {formatRole(document.uploaded_by_role)}
                      </td>
                      <td className={`${tableCellClassName} text-slate-600`}>
                        {formatDate(document.created_at)}
                      </td>
                      <td className={tableCellClassName}>
                        <div className="flex flex-wrap gap-1.5">
                          <a
                            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                            href={document.preview_url ?? document.file_url}
                            download={document.file_name}
                            title="Download"
                          >
                            D
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <FilePreviewModal document={previewDocument} onClose={() => setPreviewDocument(null)} />
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

function FileMetric({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{sublabel}</p>
    </div>
  );
}

function FilePreviewCell({
  document,
  onPreview,
}: {
  document: DocumentFile;
  onPreview: (document: DocumentFile) => void;
}) {
  const type = getFileType(document);

  return (
    <button
      type="button"
      className="group flex min-w-0 items-center gap-3 text-left"
      onClick={() => onPreview(document)}
    >
      <FileThumbnail document={document} type={type} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950">{document.file_name}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
          {document.note || formatFileMeta(document)}
        </span>
      </span>
    </button>
  );
}

function FilePreviewModal({
  document,
  onClose,
}: {
  document: DocumentFile | null;
  onClose: () => void;
}) {
  if (!document) return null;

  const url = document.preview_url ?? document.file_url;
  const isImage = isImageFile(document);
  const isPdf = getFileType(document) === "pdf" || document.mime_type?.includes("pdf");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${document.file_name}`}
      onMouseDown={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{document.file_name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{formatFileMeta(document)}</p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xl leading-none text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            aria-label="Close preview"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="flex min-h-[18rem] flex-1 items-center justify-center bg-slate-100 p-4">
          {isImage ? (
            <div className="relative h-[72vh] max-h-[72vh] w-full">
              <Image
                alt={document.file_name}
                className="object-contain"
                fill
                sizes="100vw"
                src={url}
                unoptimized
              />
            </div>
          ) : isPdf ? (
            <iframe
              className="h-[72vh] w-full rounded-md border border-slate-200 bg-white"
              src={url}
              title={document.file_name}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center gap-4 rounded-lg bg-white p-8 text-center shadow-sm">
              <FileIcon type={getFileType(document)} large />
              <div>
                <p className="text-sm font-semibold text-slate-950">{document.file_name}</p>
                <p className="mt-1 text-sm text-slate-500">Preview is not available for this file type.</p>
              </div>
              <a
                className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                href={url}
                download={document.file_name}
              >
                Download
              </a>
            </div>
          )}
        </div>
        {(isImage || isPdf) ? (
          <div className="flex justify-end border-t border-slate-200 px-4 py-3">
            <a
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href={url}
              download={document.file_name}
            >
              Download
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FileThumbnail({ document, type }: { document: DocumentFile; type: string }) {
  const url = document.preview_url ?? document.file_url;

  if (isImageFile(document)) {
    return (
      <span className="block size-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition group-hover:scale-105 sm:size-16">
        <Image
          alt=""
          className="size-full object-cover"
          height={64}
          loading="lazy"
          src={url}
          unoptimized
          width={64}
        />
      </span>
    );
  }

  return <FileIcon type={type} large />;
}

function FileIcon({ type, large = false }: { type: string; large?: boolean }) {
  const normalized = type.toLowerCase();
  const color =
    normalized === "pdf"
      ? "bg-rose-50 text-rose-700"
      : ["png", "jpg", "jpeg", "webp", "gif"].includes(normalized)
        ? "bg-amber-50 text-amber-700"
        : ["xls", "xlsx", "csv"].includes(normalized)
          ? "bg-emerald-50 text-emerald-700"
          : ["doc", "docx"].includes(normalized)
            ? "bg-blue-50 text-blue-700"
            : ["zip", "rar"].includes(normalized)
              ? "bg-indigo-50 text-indigo-700"
              : "bg-slate-100 text-slate-600";

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md border border-transparent text-[10px] font-semibold uppercase transition group-hover:scale-105 ${large ? "size-14 sm:size-16" : "size-8"} ${color}`}>
      {fileIconLabel(normalized)}
    </span>
  );
}

function isImageFile(document: DocumentFile) {
  return document.mime_type?.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(getFileType(document));
}

function fileIconLabel(type: string) {
  if (type === "pdf") return "PDF";
  if (["doc", "docx"].includes(type)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(type)) return "XLS";
  if (["zip", "rar"].includes(type)) return "ZIP";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(type)) return "IMG";
  return "FILE";
}

function formatFileMeta(document: DocumentFile) {
  const related = formatRelated(document);
  const owner = document.file_scope === "global" ? "All clients" : document.clients?.company_name ?? "Client file";

  return related === "-" ? owner : `${owner} - ${related}`;
}

function getFileType(document: DocumentFile) {
  const extension = document.file_name.split(".").pop()?.toLowerCase();

  if (extension) return extension;
  if (document.mime_type?.includes("pdf")) return "pdf";
  if (document.mime_type?.startsWith("image/")) return document.mime_type.replace("image/", "");

  return "file";
}

function documentFolder(document: DocumentFile) {
  if (document.shipment_id) return "Incoming Shipments";
  if (document.service_request_id) return "Order Service";
  if (document.invoice_id) return "Invoices";
  if (document.product_id || document.category === "Product Images") return "Product Documents";
  if (document.category === "Supplier Invoice") return "Statements";
  if (document.category === "Agreement" || document.category === "Compliance") return "Other";
  return document.category === "Other" ? "Other" : "Labels & Packing Slips";
}

function isWithinDateFilter(value: string, filter: string) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);

  if (filter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    return true;
  }

  return date >= start && date <= now;
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
