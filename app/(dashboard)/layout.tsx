import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthProvider } from "@/app/auth/auth-provider";
import { DashboardShell } from "@/app/components/dashboard-shell";
import { AUTH_REFRESH_COOKIE, AUTH_TOKEN_COOKIE } from "@/app/lib/auth";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    redirect("/login");
  }

  if (accessToken) {
    const decodedAccessToken = decodeURIComponent(accessToken);
    const supabase = createSupabaseServerClient(decodedAccessToken);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(decodedAccessToken);

    if (error || !user) {
      console.error("[dashboard-auth]", {
        action: "get user from access token failed",
        has_access_token: true,
        has_refresh_token: Boolean(refreshToken),
        error: error?.message ?? "User missing",
      });

      if (!refreshToken) {
        redirect("/login");
      }
    }
  }

  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
