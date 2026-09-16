import "server-only";
import { prisma } from "@/lib/db/prisma";

// Rate limiter de janela fixa apoiado no próprio Postgres (não precisa de
// Redis/Upstash pra começar; funciona bem com o volume atual e é consistente
// entre as várias instâncias serverless da Vercel, que não compartilham
// memória). A conta é atômica num único INSERT ... ON CONFLICT, evitando
// corrida entre requisições concorrentes.
//
// Requer o model RateLimit no schema (tabela eva_studio_rate_limits).

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "eva_studio_rate_limits" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "eva_studio_rate_limits"."windowStart" < now() - (${windowSec} * interval '1 second')
          THEN 1
          ELSE "eva_studio_rate_limits"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "eva_studio_rate_limits"."windowStart" < now() - (${windowSec} * interval '1 second')
          THEN now()
          ELSE "eva_studio_rate_limits"."windowStart"
        END
      RETURNING "count";
    `;
    const count = Number(rows[0]?.count ?? 1);
    return { allowed: count <= limit, count, limit };
  } catch (err) {
    // Se a tabela ainda não existir (migração não rodada) ou o banco falhar,
    // não derruba a requisição — apenas não limita. Fail-open é a escolha
    // consciente aqui pra não quebrar o produto por causa do limitador.
    console.error("[rate-limit] falha ao checar limite, liberando:", err);
    return { allowed: true, count: 0, limit };
  }
}

// Extrai um identificador de cliente (IP) dos headers de proxy da Vercel.
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
