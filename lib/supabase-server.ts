import { createClient } from '@supabase/supabase-js'

// service_role 키 사용 — RLS 우회, 서버 사이드 전용
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
