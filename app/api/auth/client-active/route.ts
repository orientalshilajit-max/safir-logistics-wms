import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { CLIENT_ACCOUNT_LINK_ERROR, getCurrentClientId, getUserRole } from "@/app/lib/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";

export async function POST(request: NextRequest) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const userClient = createSupabaseServerClient(accessToken);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  if (getUserRole(user) !== "client") {
    return NextResponse.json({ ok: true });
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json({ error: "Server auth sync is not configured." }, { status: 501 });
  }

  let resolvedClient: ClientLink | null;

  try {
    resolvedClient = await resolveClientForUser(user, adminClient);
  } catch (resolveError) {
    console.error("[client-active-sync]", {
      action: "resolve client",
      user_id: user.id,
      error: resolveError,
    });
    return NextResponse.json({ error: CLIENT_ACCOUNT_LINK_ERROR }, { status: 400 });
  }

  if (!resolvedClient) {
    return NextResponse.json(
      { error: CLIENT_ACCOUNT_LINK_ERROR },
      { status: 400 },
    );
  }

  const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      role: "client",
      client_id: resolvedClient.id,
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      client_id: resolvedClient.id,
    },
  });

  if (metadataError) {
    console.error("[client-active-sync]", {
      action: "update auth metadata",
      client_id: resolvedClient.id,
      user_id: user.id,
      error: metadataError,
    });
    return NextResponse.json({ error: metadataError.message }, { status: 400 });
  }

  const { error: clientUpdateError } = await adminClient
    .from("clients")
    .update({
      auth_user_id: user.id,
      login_status: "active",
    })
    .eq("id", resolvedClient.id)
    .is("deleted_at", null);

  if (clientUpdateError) {
    console.error("[client-active-sync]", {
      action: "update client link",
      client_id: resolvedClient.id,
      user_id: user.id,
      error: clientUpdateError,
    });
    return NextResponse.json({ error: clientUpdateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, client_id: resolvedClient.id });
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type ClientLink = {
  id: string;
};

async function resolveClientForUser(user: User, adminClient: AdminClient): Promise<ClientLink | null> {
  const metadataClientId = getCurrentClientId(user);

  if (metadataClientId) {
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", metadataClientId)
      .is("deleted_at", null)
      .maybeSingle();

    if (data) {
      return data;
    }
  }

  const { data: linkedClient } = await adminClient
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (linkedClient) {
    return linkedClient;
  }

  const normalizedEmail = user.email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const pageSize = 1000;
  let offset = 0;

  while (offset < 20000) {
    const { data: emailClients, error } = await adminClient
      .from("clients")
      .select("id, email")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const match = emailClients?.find((client) => client.email.trim().toLowerCase() === normalizedEmail);

    if (match) {
      return match;
    }

    if (!emailClients || emailClients.length < pageSize) {
      return null;
    }

    offset += pageSize;
  }

  return null;
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}
