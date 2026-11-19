import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cookie-aware client: knows who is signed in. Use for auth checks. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(url(), anon(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Public read-only client for stats pages. */
export function supabasePublic() {
  return createClient(url(), anon(), { auth: { persistSession: false } });
}

/** Service-role client. Server only, and only after checking permissions. */
export function supabaseAdmin() {
  return createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function screenshotUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${url()}/storage/v1/object/public/scoreboards/${path}`;
}
