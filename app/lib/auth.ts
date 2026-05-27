import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "client" | "warehouse_operator";

export const AUTH_TOKEN_COOKIE = "safir-sb-access-token";
export const AUTH_REFRESH_COOKIE = "safir-sb-refresh-token";
export const CLIENT_ACCOUNT_LINK_ERROR = "Client account is not linked correctly. Please contact support.";

export function getUserRole(user: User | null): UserRole {
  const role = user?.app_metadata?.role;

  if (role === "admin" || role === "warehouse_operator") {
    return role;
  }

  return "client";
}

export function getCurrentRole(user: User | null) {
  return getUserRole(user);
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

export function getCurrentClientId(user: User | null) {
  const clientId = getUserClientId(user);

  return clientId && isUuid(clientId) ? clientId : null;
}

export function getCurrentUser(user: User | null) {
  return user;
}

export function canAccessClient(user: User | null, clientId: string | null) {
  if (!user || !clientId) {
    return false;
  }

  return isAdmin(user) || getCurrentClientId(user) === clientId;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
