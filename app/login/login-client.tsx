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
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        </form>
      </section>
    </main>
  );
}
