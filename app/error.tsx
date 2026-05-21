"use client";

import { Button } from "@/app/components/wms-ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Safir Logistics
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The dashboard could not finish loading this view. Try again, and check the
          deployment logs if the issue continues.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
            Error digest: {error.digest}
          </p>
        ) : null}
        <Button type="button" className="mt-5" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
