"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import type { Tables } from "@/app/types/database.types";

type Notification = Tables<"notifications">;
type UserNotification = Tables<"user_notifications">;
type NotificationWithRead = Notification & {
  read_at: string | null;
};

export function NotificationMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationWithRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!user) {
      return;
    }

    const [notificationsResult, readsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id),
    ]);

    if (notificationsResult.error) {
      setError(notificationsResult.error.message);
      return;
    }

    if (readsResult.error) {
      setError(readsResult.error.message);
      return;
    }

    const readsByNotification = new Map(
      (readsResult.data ?? []).map((read: UserNotification) => [
        read.notification_id,
        read.read_at,
      ]),
    );

    setNotifications(
      (notificationsResult.data ?? []).map((notification) => ({
        ...notification,
        read_at: readsByNotification.get(notification.id) ?? null,
      })),
    );
    setError(null);
  }, [user]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(() => void loadNotifications(), 30000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  async function markAsRead(notificationId: string) {
    if (!user) {
      return;
    }

    const now = new Date().toISOString();
    const { error: readError } = await supabase.from("user_notifications").upsert(
      {
        notification_id: notificationId,
        user_id: user.id,
        read_at: now,
      },
      { onConflict: "notification_id,user_id" },
    );

    if (readError) {
      setError(readError.message);
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, read_at: now } : item,
      ),
    );
  }

  async function markAllAsRead() {
    await Promise.all(
      notifications
        .filter((item) => !item.read_at)
        .map((item) => markAsRead(item.id)),
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        aria-label="Notifications"
      >
        <span>!</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-950">Notifications</p>
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="text-xs font-semibold text-slate-500 hover:text-slate-950"
            >
              Mark all read
            </button>
          </div>
          {error ? (
            <p className="px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No notifications yet.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void markAsRead(notification.id)}
                  className={[
                    "block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50",
                    notification.read_at ? "bg-white" : "bg-blue-50/50",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">
                      {notification.title}
                    </p>
                    {!notification.read_at ? (
                      <span className="mt-1 size-2 rounded-full bg-blue-600" />
                    ) : null}
                  </div>
                  {notification.body ? (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {notification.body}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    {formatDateTime(notification.created_at)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
