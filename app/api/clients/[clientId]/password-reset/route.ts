import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";

const PASSWORD_RESET_REDIRECT_URL = "https://app.safir-logistics.com/reset-password";
const RATE_LIMIT_MESSAGE =
  "Email limit reached. Please wait a few minutes before sending another reset.";

type ClientRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Missing admin session." }, { status: 401 });
  }

  const userClient = createSupabaseServerClient(accessToken);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || user?.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can reset client passwords." }, { status: 403 });
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      { error: "Password reset requires SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 501 },
    );
  }

  const { clientId } = await context.params;
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .select("id, auth_user_id, email")
    .eq("id", clientId)
    .is("deleted_at", null)
    .single();

  if (clientError || !client) {
    return NextResponse.json(
      { error: clientError?.message ?? "Client not found." },
      { status: 404 },
    );
  }

  const typedClient = client as ClientRow;
  let authUser: User | null;

  try {
    authUser = await findAuthUserForClient(typedClient, adminClient);
  } catch (authLookupError) {
    console.error("[client-password-reset]", {
      action: "lookup auth user",
      client_id: typedClient.id,
      email: typedClient.email,
      error: authLookupError,
    });
    return NextResponse.json({ error: "Supabase auth lookup failed." }, { status: 400 });
  }

  if (!authUser) {
    return NextResponse.json(
      { error: "No Supabase Auth user is linked to this client yet." },
      { status: 404 },
    );
  }

  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
    typedClient.email,
    { redirectTo: PASSWORD_RESET_REDIRECT_URL },
  );

  if (resetError) {
    console.error("[client-password-reset]", {
      client_id: typedClient.id,
      email: typedClient.email,
      error: resetError,
    });

    if (isEmailRateLimitError(resetError.message)) {
      return NextResponse.json({
        message: "Email rate limit reached",
        detail: RATE_LIMIT_MESSAGE,
        rate_limited: true,
      });
    }

    return NextResponse.json(
      { error: "Supabase email send failed", detail: resetError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Password reset email sent.",
    auth_user_id: authUser.id,
  });
}

async function findAuthUserForClient(
  client: ClientRow,
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
) {
  if (client.auth_user_id) {
    const { data, error } = await adminClient.auth.admin.getUserById(client.auth_user_id);

    if (!error && data.user) {
      return data.user;
    }
  }

  const normalizedEmail = client.email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find(
      (listedUser: User) => listedUser.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}

function isEmailRateLimitError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit") ||
    normalized.includes("email rate") ||
    normalized.includes("email limit") ||
    normalized.includes("too many")
  );
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}
