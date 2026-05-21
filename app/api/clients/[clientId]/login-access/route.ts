import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";

type ClientRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
};

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/clients/[clientId]/login-access">,
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
    return NextResponse.json({ error: "Only admins can create client login access." }, { status: 403 });
  }

  const { clientId } = await context.params;
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      {
        error: "Automatic auth user creation requires SUPABASE_SERVICE_ROLE_KEY.",
        instructions: manualInstructions(clientId),
      },
      { status: 501 },
    );
  }

  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .select("id, company_name, contact_name, email")
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
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(typedClient.email, {
      data: {
        company_name: typedClient.company_name,
        contact_name: typedClient.contact_name,
      },
    });

  if (inviteError || !inviteData.user) {
    return NextResponse.json(
      {
        error: inviteError?.message ?? "Unable to invite Supabase Auth user.",
        instructions: manualInstructions(typedClient.id, typedClient),
      },
      { status: 400 },
    );
  }

  const { error: metadataError } = await adminClient.auth.admin.updateUserById(
    inviteData.user.id,
    {
      app_metadata: {
        ...(inviteData.user.app_metadata ?? {}),
        role: "client",
        client_id: typedClient.id,
      },
      user_metadata: {
        ...(inviteData.user.user_metadata ?? {}),
        company_name: typedClient.company_name,
        contact_name: typedClient.contact_name,
        client_id: typedClient.id,
      },
    },
  );

  if (metadataError) {
    return NextResponse.json(
      {
        error: metadataError.message,
        instructions: manualInstructions(typedClient.id, typedClient, inviteData.user.id),
      },
      { status: 400 },
    );
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      auth_user_id: inviteData.user.id,
      login_status: "invited",
    })
    .eq("id", typedClient.id);

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
        instructions: manualInstructions(typedClient.id, typedClient, inviteData.user.id),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: `Invitation sent to ${typedClient.email}.`,
    auth_user_id: inviteData.user.id,
    login_status: "invited",
  });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

function manualInstructions(clientId: string, client?: ClientRow, authUserId?: string) {
  return [
    "Add SUPABASE_SERVICE_ROLE_KEY to the server environment to enable automatic invites.",
    "Manual fallback in Supabase Dashboard:",
    `1. Create or invite an Auth user${client?.email ? ` for ${client.email}` : ""}.`,
    `2. Set app_metadata to {"role":"client","client_id":"${clientId}"}.`,
    `3. Set user_metadata client_id to "${clientId}" for easier support/debugging.`,
    authUserId
      ? `4. Update public.clients.auth_user_id to "${authUserId}" and login_status to "invited" or "active".`
      : '4. Update public.clients.auth_user_id with the Auth user id and set login_status to "invited" or "active".',
  ];
}
