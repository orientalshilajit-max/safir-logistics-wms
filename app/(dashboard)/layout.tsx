import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthProvider } from "@/app/auth/auth-provider";
import { DashboardShell } from "@/app/components/dashboard-shell";
import { AUTH_TOKEN_COOKIE } from "@/app/lib/auth";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    redirect("/login");
  }

  const supabase = createSupabaseServerClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    redirect("/login");
  }

  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
