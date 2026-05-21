"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import type { Json, Tables } from "@/app/types/database.types";
import { EmptyState, Panel, StatusBadge } from "@/app/components/wms-ui";

type ActivityLog = Tables<"activity_logs">;

export function ActivityTimeline({
  entityType,
  entityId,
  title = "Activity timeline",
}: {
  entityType: string;
  entityId: string | null;
  title?: string;
}) {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (loadError) {
      setError(loadError.message);
    } else {
      setItems(data ?? []);
      setError(null);
    }

    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTimeline(), 0);
    const interval = window.setInterval(() => void loadTimeline(), 30000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadTimeline]);

  return (
    <Panel title={title} description={entityId ? "Recent system and user events." : "Select a record to view activity."}>
      {!entityId ? (
        <EmptyState title="No record selected" body="Choose a record from the table to inspect its timeline." />
      ) : loading && items.length === 0 ? (
        <p className="text-sm text-slate-500">Loading activity...</p>
      ) : error ? (
        <p className="text-sm font-medium text-rose-700">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState title="No activity yet" body="Important updates will appear here." />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="relative border-l border-slate-200 pl-4">
              <span className="absolute -left-1.5 top-1.5 size-3 rounded-full border-2 border-white bg-slate-400" />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatAction(item.action)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {item.user_type || "System"} · {formatDateTime(item.created_at)}
                  </p>
                </div>
                <StatusBadge tone="slate">{item.entity_type}</StatusBadge>
              </div>
              <MetadataDetails metadata={item.metadata} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MetadataDetails({ metadata }: { metadata: Json }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const entries = Object.entries(metadata)
    .filter(([key]) => key !== "actor")
    .slice(0, 5);

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="font-semibold uppercase tracking-wide text-slate-400">
            {key.replaceAll("_", " ")}
          </dt>
          <dd className="mt-1 break-words font-medium text-slate-700">
            {formatMetadataValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatMetadataValue(value: Json | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatAction(action: string) {
  return action
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
