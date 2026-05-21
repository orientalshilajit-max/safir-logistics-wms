import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/app/lib/env";
import type { Database } from "@/app/types/database.types";

export function createSupabaseServerClient(accessToken?: string) {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseEnv();

  return createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : undefined,
    },
  );
}

export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { supabaseUrl } = getPublicSupabaseEnv();

  if (!serviceRoleKey) {
    return null;
  }

  return createClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
