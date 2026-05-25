import { Suspense } from "react";
import { ResetPasswordClient } from "@/app/reset-password/reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordClient />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm font-medium text-slate-500">
      Loading password reset...
    </div>
  );
}
