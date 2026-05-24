"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Panel,
  StatusBadge,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
} from "@/app/components/wms-ui";

type ClientDocument = Tables<"attachments"> & {
  preview_url?: string;
};

export function ClientDocumentsSection({ clientId }: { clientId: string }) {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [globalDocuments, setGlobalDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clientResult, globalResult] = await Promise.all([
      supabase
        .from("attachments")
        .select("*")
        .eq("entity_type", "documents")
        .eq("file_scope", "client_specific")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("attachments")
        .select("*")
        .eq("entity_type", "documents")
        .eq("file_scope", "global")
        .eq("visible_to_client", true)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const loadError = clientResult.error ?? globalResult.error;

    if (loadError) {
      setError(loadError.message);
      setDocuments([]);
      setGlobalDocuments([]);
    } else {
      const rowsWithUrls = await Promise.all(
        (clientResult.data ?? []).map(async (document) => ({
          ...document,
          preview_url: await getDocumentUrl(document),
        })),
      );
      const globalRowsWithUrls = await Promise.all(
        (globalResult.data ?? []).map(async (document) => ({
          ...document,
          preview_url: await getDocumentUrl(document),
        })),
      );
      setDocuments(rowsWithUrls);
      setGlobalDocuments(globalRowsWithUrls);
    }

    setLoading(false);
  }, [clientId]);

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

  async function archiveDocument(document: ClientDocument) {
    if (!window.confirm(`Archive ${document.file_name}?`)) {
      return;
    }

    setUpdatingId(document.id);
    setError(null);

    const { error: archiveError } = await supabase
      .from("attachments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("client_id", clientId);

    if (archiveError) {
      setError(archiveError.message);
    } else {
      await loadDocuments();
    }

    setUpdatingId(null);
  }

  return (
    <Panel title="Client Files">
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <div className="flex items-center justify-between gap-3">
          <StatusBadge tone="blue">{documents.length} client files</StatusBadge>
          <Link
            href={`/documents/new?client_id=${clientId}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <span className="mr-2 text-base leading-none">+</span>
            Add Document
          </Link>
        </div>

        {loading ? (
          <LoadingState label="Loading client files..." />
        ) : documents.length === 0 ? (
          <EmptyState
            title="No files for this client"
            body="Client-related documents, agreements, product images, and other files will appear here."
          />
        ) : (
          <div className="max-h-[24rem] overflow-auto">
            <table className={`${tableClassName} min-w-[760px]`}>
              <thead className={tableHeadClassName}>
                <tr>
                  <th className={`${tableCellClassName} font-semibold`}>File</th>
                  <th className={`${tableCellClassName} font-semibold`}>Category</th>
                  <th className={`${tableCellClassName} font-semibold`}>Visibility</th>
                  <th className={`${tableCellClassName} font-semibold`}>Uploaded by</th>
                  <th className={`${tableCellClassName} font-semibold`}>Created</th>
                  <th className={`${tableCellClassName} font-semibold`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((document) => (
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
                      {formatDate(document.created_at)}
                    </td>
                    <td className={tableCellClassName}>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          href={document.preview_url ?? document.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                        <Link
                          href={`/documents/${document.id}/edit`}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={updatingId === document.id}
                          onClick={() => void archiveDocument(document)}
                        >
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950">Shared Documents</p>
            <StatusBadge tone="indigo">{globalDocuments.length} global files</StatusBadge>
          </div>
          {globalDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No global documents are shared with clients yet.</p>
          ) : (
            <div className="grid gap-2">
              {globalDocuments.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{document.file_name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{document.category}</p>
                  </div>
                  <a
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    href={document.preview_url ?? document.file_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
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
