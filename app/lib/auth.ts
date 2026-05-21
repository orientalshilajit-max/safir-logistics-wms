import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "client" | "warehouse_operator";

export const AUTH_TOKEN_COOKIE = "safir-sb-access-token";
export const AUTH_REFRESH_COOKIE = "safir-sb-refresh-token";

export function getUserRole(user: User | null): UserRole {
  const role = user?.app_metadata?.role;

  if (role === "admin" || role === "warehouse_operator") {
    return role;
  }

  return "client";
}

export function isAdmin(user: User | null) {
  return getUserRole(user) === "admin";
}

export function isWarehouseOperator(user: User | null) {
  const role = getUserRole(user);

  return role === "admin" || role === "warehouse_operator";
}

export function getUserClientId(user: User | null) {
  const appClientId = user?.app_metadata?.client_id;
  const userClientId = user?.user_metadata?.client_id;

  return typeof appClientId === "string"
    ? appClientId
    : typeof userClientId === "string"
      ? userClientId
      : null;
}

export function canAccessClient(user: User | null, clientId: string | null) {
  if (!user || !clientId) {
    return false;
  }

  return isAdmin(user) || getUserClientId(user) === clientId;
}
