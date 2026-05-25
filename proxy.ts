import { NextResponse, type NextRequest } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/app/lib/auth";

const warehouseRestrictedPaths = [
  "/invoices",
  "/client-pricing-overrides",
  "/settings",
];

const clientRestrictedPaths = [
  "/clients",
  "/services",
  "/reports",
  "/client-pricing-overrides",
  "/products",
  "/outbound-shipments",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isResetPassword = pathname === "/reset-password";
  const accessToken = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  const hasSession = Boolean(accessToken);

  if (!hasSession && !isLogin && !isResetPassword) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (accessToken) {
    const role = getRoleFromToken(decodeURIComponent(accessToken));

    if (
      role === "warehouse_operator" &&
      warehouseRestrictedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    ) {
      return NextResponse.redirect(new URL("/requests", request.url));
    }

    if (
      role === "client" &&
      clientRestrictedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

function getRoleFromToken(token: string) {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded = JSON.parse(globalThis.atob(padded)) as {
      app_metadata?: { role?: string };
    };

    return decoded.app_metadata?.role ?? "client";
  } catch {
    return "client";
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
