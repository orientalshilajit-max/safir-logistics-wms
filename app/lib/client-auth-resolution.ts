import type { User } from "@supabase/supabase-js";
import { getCurrentClientId, getCurrentRole } from "@/app/lib/auth";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type ClientLinkResolution = {
  clientId: string | null;
  failedLookups: string[];
  source: "app_metadata" | "user_metadata" | "clients.auth_user_id" | "clients.email" | null;
};

export async function resolveAndRepairCurrentClientId(
  user: User,
  adminClient: AdminClient,
): Promise<ClientLinkResolution> {
  const failedLookups: string[] = [];
  const role = getCurrentRole(user);

  if (role === "admin") {
    return { clientId: null, failedLookups: ["admin_user_skipped"], source: null };
  }

  const appMetadataClientId = stringOrNull(user.app_metadata?.client_id);
  const userMetadataClientId = stringOrNull(user.user_metadata?.client_id);
  const metadataClientId = getCurrentClientId(user);

  if (metadataClientId) {
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", metadataClientId)
      .is("deleted_at", null)
      .maybeSingle();

    if (data) {
      const source = appMetadataClientId === metadataClientId ? "app_metadata" : "user_metadata";
      await repairClientLink(user, data.id, adminClient);
      return { clientId: data.id, failedLookups, source };
    }

    failedLookups.push("metadata_client_id_not_found");
  } else {
    if (!appMetadataClientId) failedLookups.push("app_metadata_client_id_missing");
    if (!userMetadataClientId) failedLookups.push("user_metadata_client_id_missing");
  }

  const { data: linkedClient } = await adminClient
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (linkedClient) {
    await repairClientLink(user, linkedClient.id, adminClient);
    return { clientId: linkedClient.id, failedLookups, source: "clients.auth_user_id" };
  }

  failedLookups.push("clients_auth_user_id_not_found");

  const normalizedEmail = user.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    failedLookups.push("auth_email_missing");
    return { clientId: null, failedLookups, source: null };
  }

  const emailClientId = await findClientIdByEmail(normalizedEmail, adminClient);

  if (emailClientId) {
    await repairClientLink(user, emailClientId, adminClient);
    return { clientId: emailClientId, failedLookups, source: "clients.email" };
  }

  failedLookups.push("clients_email_not_found");
  return { clientId: null, failedLookups, source: null };
}

async function repairClientLink(user: User, clientId: string, adminClient: AdminClient) {
  const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      role: "client",
      client_id: clientId,
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      client_id: clientId,
    },
  });

  if (metadataError) {
    throw metadataError;
  }

  const { error: clientUpdateError } = await adminClient
    .from("clients")
    .update({
      auth_user_id: user.id,
      login_status: "active",
    })
    .eq("id", clientId)
    .is("deleted_at", null);

  if (clientUpdateError) {
    throw clientUpdateError;
  }
}

async function findClientIdByEmail(normalizedEmail: string, adminClient: AdminClient) {
  const pageSize = 1000;
  let offset = 0;

  while (offset < 20000) {
    const { data, error } = await adminClient
      .from("clients")
      .select("id, email")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const match = data?.find((client) => client.email.trim().toLowerCase() === normalizedEmail);

    if (match) {
      return match.id;
    }

    if (!data || data.length < pageSize) {
      return null;
    }

    offset += pageSize;
  }

  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
