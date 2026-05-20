"use client";

import { useState } from "react";
import { useAuth } from "@/app/auth/auth-provider";

export function LogoutButton() {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await signOut();
        setLoading(false);
      }}
      className="hidden rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 sm:inline-flex"
    >
      {loading ? "Signing out..." : "Logout"}
    </button>
  );
}
