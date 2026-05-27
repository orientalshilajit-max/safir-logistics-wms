"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clientPortalRoutes, dashboardRoutes, type DashboardRoute } from "@/app/lib/dashboard";
import { LogoutButton } from "@/app/components/logout-button";
import { NotificationMenu } from "@/app/components/notification-menu";
import { useAuth } from "@/app/auth/auth-provider";
import type { UserRole } from "@/app/lib/auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, role } = useAuth();
  const visibleRoutes = getVisibleRoutes(role);
  const isClientPortal = role === "client";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Loading account...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 bg-[#0b1f3a] text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] lg:block">
          <SidebarContent
            pathname={pathname}
            routes={visibleRoutes}
            clientPortal={isClientPortal}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Safir Logistics
                </p>
                <h1 className="truncate text-lg font-semibold text-slate-950">
                  {isClientPortal ? "Client Portal" : "Prep Center WMS"}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <NotificationMenu />
                <Link
                  href="/settings"
                  className="hidden h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
                >
                  Account
                </Link>
                <LogoutButton />
                <div className="flex size-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                  SL
                </div>
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-3 lg:hidden">
              {visibleRoutes.map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={pathname === item.href}
                />
              ))}
            </nav>
          </header>

          <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-6">
            <div className={isClientPortal ? "mx-auto max-w-[98rem]" : "mx-auto max-w-7xl"}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  routes,
  clientPortal,
}: {
  pathname: string;
  routes: DashboardRoute[];
  clientPortal: boolean;
}) {
  return (
    <div className="flex h-screen flex-col">
      <div
        className={[
          "border-b border-white/10 px-5 py-4",
        ].join(" ")}
      >
        <Link href="/" className="flex h-12 items-center gap-3">
          <Image
            src="/logosaflog.png"
            alt="Safir Logistics"
            width={198}
            height={80}
            priority
            className={[
              "h-10 w-auto object-contain",
              "rounded-md bg-white px-2 py-1",
            ].join(" ")}
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
        {routes.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex min-h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition",
                active
                  ? "bg-blue-600/90 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.25),0_8px_24px_rgba(37,99,235,0.22)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/10 px-3 py-4">
        <Link
          href="/settings"
          className="flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {clientPortal ? "Help & Support" : "Settings"}
        </Link>
        <div className="px-3 text-xs font-medium text-slate-400">Use the top bar to log out.</div>
      </div>
    </div>
  );
}

function getVisibleRoutes(role: UserRole) {
  if (role === "client") {
    return clientPortalRoutes;
  }

  if (role !== "warehouse_operator") {
    return dashboardRoutes;
  }

  const restrictedRoutes = new Set([
    "/documents",
    "/invoices",
    "/client-pricing-overrides",
    "/settings",
  ]);

  return dashboardRoutes.filter((route) => !restrictedRoutes.has(route.href));
}

function MobileNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
