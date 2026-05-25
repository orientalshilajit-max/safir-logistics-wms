"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
} from "@/app/components/wms-ui";

const minimumPasswordLength = 8;

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeRecoverySession() {
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError && mounted) {
          setError(exchangeError.message);
        }
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
      }

      setHasRecoverySession(Boolean(session));
      setInitializing(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(Boolean(session));
      }
    });

    void initializeRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (newPassword.length < minimumPasswordLength) {
      setError(`New password must be at least ${minimumPasswordLength} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully. You can now sign in.");
      await supabase.auth.signOut();
    }

    setSaving(false);
  }

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-500">
        Checking recovery link...
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <Image
            src="/logosaflog.png"
            alt="Safir Logistics"
            width={198}
            height={80}
            priority
            className="mx-auto h-14 w-auto object-contain"
          />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
            Reset Password
          </h1>
        </div>

        <div className="mt-6 space-y-4">
          <ErrorBanner message={error} />
          {message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {message}
            </div>
          ) : null}

          {!hasRecoverySession && !message ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              This reset link is expired or invalid. Request a new password reset email from the login page.
            </div>
          ) : null}

          {hasRecoverySession && !message ? (
            <form className="space-y-4" onSubmit={(event) => void resetPassword(event)}>
              <Field label="New password">
                <input
                  className={inputClassName}
                  minLength={minimumPasswordLength}
                  required
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  className={inputClassName}
                  minLength={minimumPasswordLength}
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Updating..." : "Set New Password"}
              </Button>
            </form>
          ) : null}

          <Link
            href="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
