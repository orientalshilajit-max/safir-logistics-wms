"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider } from "@/app/auth/auth-provider";
import { supabase } from "@/app/lib/supabase";
import { Button, ErrorBanner, Field, inputClassName } from "@/app/components/wms-ui";

export function LoginClient() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      if (data.session) {
        router.replace(nextPath);
      } else {
        setInitializing(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [nextPath, router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetLoading) {
      return;
    }

    setResetLoading(true);
    setError(null);
    setMessage(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: "https://app.safir-logistics.com/reset-password",
    });

    if (resetError) {
      setError(formatPasswordResetError(resetError.message));
    } else {
      setMessage("Password reset email sent.");
      setResetEmail("");
    }

    setResetLoading(false);
  }

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-500">
        Checking session...
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
            Sign in to WMS
          </h1>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleLogin(event)}>
          <ErrorBanner message={error} />
          {message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {message}
            </div>
          ) : null}
          <Field label="Email">
            <input
              className={inputClassName}
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClassName}
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline"
            onClick={() => {
              setShowForgotPassword((current) => !current);
              setError(null);
              setMessage(null);
              setResetEmail(email);
            }}
          >
            Forgot password?
          </button>
        </form>

        {showForgotPassword ? (
          <form className="mt-5 space-y-4 border-t border-slate-200 pt-5" onSubmit={(event) => void handleForgotPassword(event)}>
            <Field label="Reset email">
              <input
                className={inputClassName}
                required
                type="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" className="w-full" disabled={resetLoading}>
              {resetLoading ? "Sending..." : "Send reset email"}
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function formatPasswordResetError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("email rate") ||
    normalized.includes("too many")
  ) {
    return "Email limit reached. Please wait a few minutes before requesting another reset.";
  }

  return message;
}
