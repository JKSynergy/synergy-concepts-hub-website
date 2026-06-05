import { createClient } from "@supabase/supabase-js";

// Service-role client — SERVER ONLY. Never import this into client components.
// Requires SUPABASE_SERVICE_ROLE_KEY (not the public anon key).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
