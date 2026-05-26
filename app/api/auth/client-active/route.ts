import { NextResponse, type NextRequest } from "next/server";
import { getUserClientId, getUserRole } from "@/app/lib/auth";
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

  const clientId = getUserClientId(user);

  if (!clientId) {
    return NextResponse.json({ error: "Client id missing from session." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json({ error: "Server auth sync is not configured." }, { status: 501 });
  }

  const { error } = await adminClient
    .from("clients")
    .update({
      auth_user_id: user.id,
      login_status: "active",
    })
    .eq("id", clientId)
    .is("deleted_at", null);

  if (error) {
    console.error("[client-active-sync]", {
      client_id: clientId,
      user_id: user.id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}
