import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/app/types/database.types'
import { getPublicSupabaseEnv } from '@/app/lib/env'

const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseEnv()

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
)
