"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  AUTH_REFRESH_COOKIE,
  AUTH_TOKEN_COOKIE,
  getUserClientId,
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
      syncAuthCookies(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      loading,
      role: getUserRole(user),
      session,
      user,
      clientId: getUserClientId(user),
      signOut: async () => {
        setError(null);
        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
          setError(signOutError.message);
          return;
        }

        syncAuthCookies(null);
        window.location.assign("/login");
      },
    }),
    [error, loading, session, user],
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

  if (!session) {
    document.cookie = `${AUTH_TOKEN_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${AUTH_REFRESH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    return;
  }

  const maxAge = Math.max(session.expires_in ?? 3600, 60);
  document.cookie = `${AUTH_TOKEN_COOKIE}=${session.access_token}; Max-Age=${maxAge}; path=/; SameSite=Lax`;
  document.cookie = `${AUTH_REFRESH_COOKIE}=${session.refresh_token}; Max-Age=2592000; path=/; SameSite=Lax`;
}
