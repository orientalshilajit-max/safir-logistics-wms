import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";

const PRODUCTION_REDIRECT_URL = "https://app.safir-logistics.com";
const RATE_LIMIT_MESSAGE =
  "Email limit reached. Please wait a few minutes before sending another invite.";
const ADMIN_RATE_LIMIT_MESSAGE = "Email rate limit reached";
const ADMIN_EMAIL_LINK_ERROR =
  "This email belongs to an admin user and cannot be linked as a client.";
const EMAIL_SEND_FAILED_MESSAGE = "Supabase email send failed";

type ClientRow = {
  id: string;
  auth_user_id: string | null;
  company_name: string;
  contact_name: string;
  email: string;
  login_status: "no login" | "invited" | "active";
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
  const body = (await request.json().catch(() => ({}))) as {
    action?: "create" | "resend";
  };
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
    .select("id, auth_user_id, company_name, contact_name, email, login_status")
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
  let existingUser: User | null;

  try {
    existingUser = await findAuthUserForClient(typedClient, adminClient);
  } catch (authLookupError) {
    logAuthError("lookup auth user", authLookupError, typedClient);
    return NextResponse.json(
      {
        error: "Supabase auth lookup failed",
        instructions: manualInstructions(typedClient.id, typedClient),
      },
      { status: 400 },
    );
  }

  if (existingUser && isAdminAuthUser(existingUser)) {
    logAuthError("blocked admin email client link", null, typedClient);
    return NextResponse.json(
      { error: ADMIN_EMAIL_LINK_ERROR },
      { status: 409 },
    );
  }

  if (existingUser && user?.id === existingUser.id) {
    logAuthError("blocked current admin metadata overwrite", null, typedClient);
    return NextResponse.json(
      { error: ADMIN_EMAIL_LINK_ERROR },
      { status: 409 },
    );
  }

  if (
    existingUser?.email_confirmed_at &&
    typedClient.login_status === "active" &&
    body.action !== "resend"
  ) {
    return NextResponse.json({
      message: "User already active",
      auth_user_id: existingUser.id,
      login_status: "active",
    });
  }

  const { user: invitedUser, error: inviteError } = existingUser
    ? { user: null, error: null }
    : await inviteNewUser(typedClient, adminClient);
  const authUser = existingUser ?? invitedUser;
  const isResend = body.action === "resend" || Boolean(existingUser);

  if (inviteError) {
    if (isEmailRateLimitError(inviteError.message)) {
      logAuthError("invite email rate limit", inviteError, typedClient);
      return NextResponse.json({
        message: ADMIN_RATE_LIMIT_MESSAGE,
        detail: RATE_LIMIT_MESSAGE,
        rate_limited: true,
      });
    }

    logAuthError("invite email send", inviteError, typedClient);
    return NextResponse.json(
      {
        error: EMAIL_SEND_FAILED_MESSAGE,
        detail: inviteError.message,
        instructions: manualInstructions(typedClient.id, typedClient),
      },
      { status: 400 },
    );
  }

  if (!authUser) {
    return NextResponse.json(
      {
        error: "Unable to create or locate Supabase Auth user.",
        instructions: manualInstructions(typedClient.id, typedClient),
      },
      { status: 400 },
    );
  }

  const { data: updatedUserData, error: metadataError } =
    await adminClient.auth.admin.updateUserById(authUser.id, {
      app_metadata: {
        ...(authUser.app_metadata ?? {}),
        role: "client",
        client_id: typedClient.id,
      },
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        company_name: typedClient.company_name,
        contact_name: typedClient.contact_name,
        client_id: typedClient.id,
      },
    });

  if (metadataError || !updatedUserData.user) {
    logAuthError("update auth metadata", metadataError, typedClient);
    return NextResponse.json(
      {
        error: metadataError?.message ?? "Unable to update client auth metadata.",
        instructions: manualInstructions(typedClient.id, typedClient, authUser.id),
      },
      { status: 400 },
    );
  }

  if (existingUser) {
    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(
      typedClient.email,
      {
        redirectTo: getEmailRedirectUrl(),
      },
    );

    if (resetError) {
      if (isEmailRateLimitError(resetError.message)) {
        logAuthError("recovery email rate limit", resetError, typedClient);
        return NextResponse.json({
          message: ADMIN_RATE_LIMIT_MESSAGE,
          detail: RATE_LIMIT_MESSAGE,
          rate_limited: true,
        });
      }

      logAuthError("recovery email send", resetError, typedClient);
      return NextResponse.json(
        {
          error: EMAIL_SEND_FAILED_MESSAGE,
          detail: resetError.message,
          instructions: existingUser.email_confirmed_at
            ? passwordResetInstructions(typedClient)
            : unconfirmedUserInstructions(typedClient, existingUser.id),
        },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      auth_user_id: updatedUserData.user.id,
      login_status: nextLoginStatus(typedClient, updatedUserData.user),
    })
    .eq("id", typedClient.id);

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
        instructions: manualInstructions(typedClient.id, typedClient, updatedUserData.user.id),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: isResend ? "Invite resent" : "Invite sent",
    auth_user_id: updatedUserData.user.id,
    login_status: nextLoginStatus(typedClient, updatedUserData.user),
  });
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

async function inviteNewUser(
  client: ClientRow,
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
) {
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
    client.email,
    {
      data: {
        company_name: client.company_name,
        contact_name: client.contact_name,
        client_id: client.id,
      },
      redirectTo: getEmailRedirectUrl(),
    },
  );

  return { user: data.user, error };
}

function getEmailRedirectUrl() {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  return PRODUCTION_REDIRECT_URL;
}

function logAuthError(action: string, error: unknown, client?: ClientRow) {
  console.error("[client-invite]", {
    action,
    client_id: client?.id,
    email: client?.email,
    error,
  });
}

function isAdminAuthUser(user: User) {
  return user.app_metadata?.role === "admin";
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
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
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

function nextLoginStatus(client: ClientRow, user: { email_confirmed_at?: string | null }) {
  if (client.login_status === "active" || user.email_confirmed_at) {
    return "active";
  }

  return "invited";
}

function passwordResetInstructions(client: ClientRow) {
  return [
    `The Auth user for ${client.email} exists and is confirmed.`,
    `Confirm ${PRODUCTION_REDIRECT_URL} is configured in Supabase Auth redirect URLs.`,
    "Then send a password reset email from Supabase Auth, or retry Resend Invite.",
  ];
}

function unconfirmedUserInstructions(client: ClientRow, authUserId: string) {
  return [
    `The Auth user for ${client.email} exists but is not confirmed.`,
    `Auth user id: ${authUserId}`,
    `Confirm ${PRODUCTION_REDIRECT_URL} is configured in Supabase Auth redirect URLs.`,
    "Then resend an invite or password reset email from Supabase Auth.",
  ];
}
