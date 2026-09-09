import "server-only";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";

// Every Route Handler that touches org-scoped data calls this first — Prisma
// has no RLS (it bypasses PostgREST entirely), so authorization has to happen
// here, not in the database.
export async function requireOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  return profile?.orgId ?? null;
}

export async function requireUser(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id } : null;
}
