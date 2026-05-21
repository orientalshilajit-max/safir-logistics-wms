"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
  textAreaClassName,
} from "@/app/components/wms-ui";

type ShippingLabel = Tables<"shipping_labels"> & {
  preview_url?: string;
};

export type RequestBoxOption = Pick<
  Tables<"request_boxes">,
  "id" | "box_number" | "tracking_number"
>;

type LabelCategory = ShippingLabel["label_category"];
type RequestStatus = Tables<"service_requests">["status"];

const categoryLabels: Record<LabelCategory, string> = {
  fba_box_label: "FBA box label",
  shipping_label: "Shipping label",
  pallet_label: "Pallet label",
  misc_document: "Misc document",
};

const statusHelpers: RequestStatus[] = [
  "Waiting Labels",
  "Labels Uploaded",
  "Ready to Pack",
];

export function LabelManager({
  clientId,
  serviceRequestId,
  boxes = [],
  title = "Labels",
  onLabelsChange,
  onStatusChange,
}: {
  clientId: string | null | undefined;
  serviceRequestId: string | null | undefined;
  boxes?: RequestBoxOption[];
  title?: string;
  onLabelsChange?: () => void | Promise<void>;
  onStatusChange?: (status: RequestStatus) => void;
}) {
  const { role, user } = useAuth();
  const [labels, setLabels] = useState<ShippingLabel[]>([]);
  const [category, setCategory] = useState<LabelCategory>("shipping_label");
  const [requestBoxId, setRequestBoxId] = useState("");
  const [boxNumber, setBoxNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUpdateStatus = role === "admin" || role === "warehouse_operator";

  const loadLabels = useCallback(async () => {
    if (!serviceRequestId) {
      setLabels([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: labelsError } = await supabase
      .from("shipping_labels")
      .select("*")
      .eq("service_request_id", serviceRequestId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (labelsError) {
      setError(labelsError.message);
      setLabels([]);
      setLoading(false);
      return;
    }

    const labelsWithPreviews = await Promise.all(
      (data ?? []).map(async (label) => {
        if (!label.storage_path) {
          return { ...label, preview_url: label.file_url };
        }

        const { data: signedUrl } = await supabase.storage
          .from("shipping-labels")
          .createSignedUrl(label.storage_path, 60 * 60);

        return {
          ...label,
          preview_url: signedUrl?.signedUrl ?? label.file_url,
        };
      }),
    );

    setLabels(labelsWithPreviews);
    setLoading(false);
  }, [serviceRequestId]);

  useEffect(() => {
    let active = true;

    async function loadInitialLabels() {
      await Promise.resolve();
      if (active) {
        await loadLabels();
      }
    }

    void loadInitialLabels();

    return () => {
      active = false;
    };
  }, [loadLabels]);

  const missingBoxes = useMemo(() => {
    if (boxes.length === 0) {
      return [];
    }

    return boxes.filter((box) => {
      const hasBoxLabel = labels.some(
        (label) =>
          (label.request_box_id === box.id || label.box_number === box.box_number) &&
          (label.label_category === "fba_box_label" ||
            label.label_category === "shipping_label"),
      );

      return !hasBoxLabel;
    });
  }, [boxes, labels]);

  const missingLabelWarning = useMemo(() => {
    if (!serviceRequestId || loading) {
      return null;
    }

    if (boxes.length > 0 && missingBoxes.length > 0) {
      return `${missingBoxes.length} box${missingBoxes.length === 1 ? "" : "es"} missing FBA or shipping labels.`;
    }

    if (boxes.length === 0 && labels.length === 0) {
      return "No labels have been uploaded for this request yet.";
    }

    return null;
  }, [boxes.length, labels.length, loading, missingBoxes.length, serviceRequestId]);

  async function uploadLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;

    if (!clientId || !serviceRequestId) {
      setError("Select a service request before uploading labels.");
      return;
    }

    if (!file) {
      setError("Choose a PDF or image file to upload.");
      return;
    }

    setUploading(true);
    setError(null);

    const selectedBox = boxes.find((box) => box.id === requestBoxId);
    const manualBoxNumber = Number(boxNumber) || null;
    const effectiveBoxNumber = selectedBox?.box_number ?? manualBoxNumber;
    const storagePath = [
      clientId,
      serviceRequestId,
      `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`,
    ].join("/");

    const { error: uploadError } = await supabase.storage
      .from("shipping-labels")
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
      .from("shipping-labels")
      .createSignedUrl(storagePath, 60 * 60);

    const { error: insertError } = await supabase.from("shipping_labels").insert({
      client_id: clientId,
      service_request_id: serviceRequestId,
      request_box_id: requestBoxId || null,
      entity_type: "service_requests",
      entity_id: serviceRequestId,
      label_category: category,
      box_number: effectiveBoxNumber,
      file_name: file.name,
      file_url: signedUrl?.signedUrl ?? storagePath,
      storage_path: storagePath,
      mime_type: file.type || null,
      uploaded_by: user?.id ?? null,
      notes: notes.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    setFile(null);
    setNotes("");
    setBoxNumber("");
    setRequestBoxId("");
    await loadLabels();
    await onLabelsChange?.();
    setUploading(false);
  }

  async function updateRequestStatus(status: RequestStatus) {
    if (!serviceRequestId || updatingStatus) return;

    setUpdatingStatus(status);
    setError(null);

    const { error: statusError } = await supabase
      .from("service_requests")
      .update({ status })
      .eq("id", serviceRequestId);

    if (statusError) {
      setError(statusError.message);
    } else {
      onStatusChange?.(status);
    }

    setUpdatingStatus(null);
  }

  return (
    <Panel
      title={title}
      description="Upload, preview, and prepare request labels without carrier or printer integration."
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #label-print-area, #label-print-area * { visibility: visible; }
          #label-print-area { display: block !important; position: absolute; inset: 0; width: 100%; padding: 24px; background: white; }
          .label-print-break { break-after: page; page-break-after: always; }
        }
      `}</style>
      <ErrorBanner message={error} />

      {!serviceRequestId ? (
        <EmptyState
          title="No request selected"
          body="Select a service request to upload and preview labels."
        />
      ) : (
        <div className="space-y-5">
          {missingLabelWarning ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {missingLabelWarning}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-800">Label coverage looks ready.</p>
              <StatusBadge tone="emerald">Labels ready</StatusBadge>
            </div>
          )}

          {canUpdateStatus ? (
            <div className="flex flex-wrap gap-2">
              {statusHelpers.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="secondary"
                  disabled={updatingStatus !== null}
                  onClick={() => void updateRequestStatus(status)}
                >
                  {updatingStatus === status ? "Updating..." : status}
                </Button>
              ))}
            </div>
          ) : null}

          <form className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void uploadLabel(event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label category">
                <select
                  className={inputClassName}
                  value={category}
                  onChange={(event) => setCategory(event.target.value as LabelCategory)}
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Attach to box">
                <select
                  className={inputClassName}
                  value={requestBoxId}
                  onChange={(event) => {
                    const nextBoxId = event.target.value;
                    setRequestBoxId(nextBoxId);
                    const selectedBox = boxes.find((box) => box.id === nextBoxId);
                    setBoxNumber(selectedBox ? String(selectedBox.box_number) : "");
                  }}
                >
                  <option value="">Request-level label</option>
                  {boxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      Box {box.box_number}
                      {box.tracking_number ? ` - ${box.tracking_number}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Box number">
                <input
                  className={inputClassName}
                  min="1"
                  type="number"
                  value={boxNumber}
                  onChange={(event) => setBoxNumber(event.target.value)}
                />
              </Field>
              <Field label="PDF or image file">
                <input
                  className={inputClassName}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                className={textAreaClassName}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload label"}
            </Button>
          </form>

          {loading ? (
            <LoadingState label="Loading labels..." />
          ) : labels.length === 0 ? (
            <EmptyState
              title="No labels uploaded"
              body="Upload FBA box labels, shipping labels, pallet labels, or supporting documents."
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge tone="blue">{labels.length} labels</StatusBadge>
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  Open print-ready view
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {labels.map((label) => (
                  <LabelPreviewCard key={label.id} label={label} />
                ))}
              </div>

              <div id="label-print-area" className="hidden">
                <h1 className="mb-4 text-xl font-semibold">Shipping labels</h1>
                {labels.map((label) => (
                  <div key={label.id} className="label-print-break mb-6">
                    <p className="mb-3 text-sm font-semibold">
                      {categoryLabels[label.label_category]}
                      {label.box_number ? ` - Box ${label.box_number}` : ""}
                    </p>
                    <PrintPreview label={label} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function hasMissingBoxLabels(
  boxes: RequestBoxOption[],
  labels: Pick<ShippingLabel, "label_category" | "request_box_id" | "box_number">[],
) {
  if (boxes.length === 0) {
    return labels.length === 0;
  }

  return boxes.some(
    (box) =>
      !labels.some(
        (label) =>
          (label.request_box_id === box.id || label.box_number === box.box_number) &&
          (label.label_category === "fba_box_label" ||
            label.label_category === "shipping_label"),
      ),
  );
}

function LabelPreviewCard({ label }: { label: ShippingLabel }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label.file_name}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {categoryLabels[label.label_category]}
            {label.box_number ? ` · Box ${label.box_number}` : ""}
          </p>
        </div>
        <StatusBadge tone={label.label_category === "misc_document" ? "slate" : "blue"}>
          {label.mime_type?.includes("pdf") ? "PDF" : label.mime_type?.startsWith("image/") ? "Image" : "File"}
        </StatusBadge>
      </div>
      <div className="bg-slate-50 p-3">
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
          <InlinePreview label={label} />
        </div>
      </div>
      {label.notes ? <p className="px-4 pb-4 text-sm text-slate-600">{label.notes}</p> : null}
    </article>
  );
}

function InlinePreview({ label }: { label: ShippingLabel }) {
  const url = label.preview_url ?? label.file_url;

  if (isImageLabel(label)) {
    return (
      <Image
        src={url}
        alt={label.file_name}
        width={900}
        height={600}
        unoptimized
        className="max-h-72 w-full object-contain"
      />
    );
  }

  if (isPdfLabel(label)) {
    return <iframe src={url} title={label.file_name} className="h-72 w-full" />;
  }

  return (
    <a className="text-sm font-semibold text-blue-700 underline" href={url} target="_blank">
      Open document
    </a>
  );
}

function PrintPreview({ label }: { label: ShippingLabel }) {
  const url = label.preview_url ?? label.file_url;

  if (isImageLabel(label)) {
    return (
      <Image
        src={url}
        alt={label.file_name}
        width={1200}
        height={1600}
        unoptimized
        className="max-h-[9in] w-full object-contain"
      />
    );
  }

  if (isPdfLabel(label)) {
    return <iframe src={url} title={label.file_name} className="h-[9in] w-full" />;
  }

  return <p>{label.file_name}</p>;
}

function isImageLabel(label: ShippingLabel) {
  return label.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(label.file_name);
}

function isPdfLabel(label: ShippingLabel) {
  return label.mime_type === "application/pdf" || /\.pdf$/i.test(label.file_name);
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}
