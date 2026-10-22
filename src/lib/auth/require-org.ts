import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, type OpcoesDaSessao } from "@/lib/server/permissions";

// Every Route Handler that touches org-scoped data calls this first — Prisma
// has no RLS (it bypasses PostgREST entirely), so authorization has to happen
// here, not in the database.
//
// Devolve o contrato ATIVO da requisição (cabeçalho x-eva-contrato conferido
// contra o vínculo), não mais só Profile.orgId: ver src/lib/server/contratos.ts.
export async function requireOrgId(opcoes?: OpcoesDaSessao): Promise<string | null> {
  return (await getSessionContext(opcoes))?.orgId ?? null;
}

export async function requireUser(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id } : null;
}
