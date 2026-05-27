"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_TOKEN_COOKIE,
  getCurrentClientId,
  getUserRole,
  type UserRole,
} from "@/app/lib/auth";

type AuthContextValue = {
  error: string | null;
  loading: boolean;
  role: UserRole;
  session: Session | null;
  user: User | null;
  clientId: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) {
          return;
        }

        if (sessionError) {
          setError(sessionError.message);
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLinkedClientId(null);
        syncAuthCookies(data.session);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLinkedClientId(null);
      syncAuthCookies(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const role = getUserRole(user);

    if (!session?.access_token || role !== "client") {
      return;
    }

    void fetch("/api/auth/client-active", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { client_id?: string };

        if (!response.ok || !body.client_id) {
          return;
        }

        setLinkedClientId(body.client_id);

        const { data } = await supabase.auth.refreshSession();
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          syncAuthCookies(data.session);
        }
      })
      .catch((syncError) => {
        console.error("[client-active-sync]", syncError);
      });
  }, [session?.access_token, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      loading,
      role: getUserRole(user),
      session,
      user,
      clientId: getCurrentClientId(user) ?? linkedClientId,
      signOut: async () => {
        setError(null);
        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
          setError(signOutError.message);
          return;
        }

        setLinkedClientId(null);
        syncAuthCookies(null);
        window.location.assign("/login");
      },
    }),
    [error, linkedClientId, loading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

function syncAuthCookies(session: Session | null) {
  if (typeof document === "undefined") {
    return;
  }

  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  const baseCookieOptions = `path=/; SameSite=Lax${secureFlag}`;

  if (!session) {
    document.cookie = `${AUTH_TOKEN_COOKIE}=; Max-Age=0; ${baseCookieOptions}`;
    document.cookie = `${AUTH_REFRESH_COOKIE}=; Max-Age=0; ${baseCookieOptions}`;
    return;
  }

  const maxAge = Math.max(session.expires_in ?? 3600, 60);
  document.cookie = `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(session.access_token)}; Max-Age=${maxAge}; ${baseCookieOptions}`;
  document.cookie = `${AUTH_REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Max-Age=2592000; ${baseCookieOptions}`;
}
