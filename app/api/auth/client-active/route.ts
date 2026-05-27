import { NextResponse, type NextRequest } from "next/server";
import { CLIENT_ACCOUNT_LINK_ERROR, getCurrentRole } from "@/app/lib/auth";
import { resolveAndRepairCurrentClientId } from "@/app/lib/client-auth-resolution";
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

  const role = getCurrentRole(user);

  if (role !== "client") {
    return NextResponse.json({ ok: true });
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json({ error: "Server auth sync is not configured." }, { status: 501 });
  }

  let resolution: Awaited<ReturnType<typeof resolveAndRepairCurrentClientId>>;

  try {
    resolution = await resolveAndRepairCurrentClientId(user, adminClient);
  } catch (resolveError) {
    console.error("[client-active-sync]", {
      action: "resolve client",
      user_id: user.id,
      email: user.email ?? null,
      role,
      app_metadata_client_id: user.app_metadata?.client_id ?? null,
      user_metadata_client_id: user.user_metadata?.client_id ?? null,
      error: resolveError,
    });
    return NextResponse.json({ error: CLIENT_ACCOUNT_LINK_ERROR }, { status: 400 });
  }

  console.error("[client-active-sync]", {
    action: resolution.clientId ? "client link resolved" : "client link failed",
    user_id: user.id,
    email: user.email ?? null,
    role,
    app_metadata_client_id: user.app_metadata?.client_id ?? null,
    user_metadata_client_id: user.user_metadata?.client_id ?? null,
    resolved_client_id: resolution.clientId,
    source: resolution.source,
    failed_lookups: resolution.failedLookups,
  });

  if (!resolution.clientId) {
    console.error("[client-active-sync]", {
      action: "client link failed",
      user_id: user.id,
      email: user.email ?? null,
      role,
      failed_lookups: resolution.failedLookups,
    });
    return NextResponse.json(
      { error: CLIENT_ACCOUNT_LINK_ERROR },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, client_id: resolution.clientId });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}
